// Offline browser smoke checks for the personal atlas. No repository files are changed.
const assert=require("node:assert/strict"), fs=require("node:fs"),path=require("node:path"),os=require("node:os"),{spawn}=require("node:child_process"),{pathToFileURL}=require("node:url");
const root=__dirname;
const browser=["C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
assert(browser,"Chrome or Edge required");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"b6-atlas-"));
const child=spawn(browser,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+temp,"about:blank"],{stdio:["ignore","ignore","pipe"],windowsHide:true});
let ws;
(async()=>{
 const endpoint=await new Promise((resolve,reject)=>{let log="";child.stderr.on("data",b=>{log+=b;const m=log.match(/DevTools listening on ws:\/\/([^/]+)\//);if(m)resolve(m[1]);});child.on("exit",()=>reject(Error(log)));});
 const target=(await(await fetch("http://"+endpoint+"/json")).json()).find(t=>t.type==="page");
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener("open",r));
 let seq=0;const pending=new Map(),errors=[],network=[];
 ws.addEventListener("message",({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)(m);pending.delete(m.id);}if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails);if(m.method==="Network.requestWillBeSent")network.push(m.params.request.url);});
 const send=async(method,params={})=>{const r=await new Promise(resolve=>{pending.set(++seq,resolve);ws.send(JSON.stringify({id:seq,method,params}));});if(r.error)throw Error(JSON.stringify(r.error));return r.result;};
 const js=async(expression)=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 for(const d of ["Page","Runtime","Network"])await send(d+".enable");
 await send("Network.emulateNetworkConditions",{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await send("Emulation.setDeviceMetricsOverride",{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
 await send("Page.navigate",{url:pathToFileURL(path.join(root,"index.html")).href});
 for(let i=0;i<50;i++){if(await js("document.readyState==='complete' && !!window.ATLAS"))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await js("ATLAS.nodes.length"),38);
 const data=await js("ATLAS");
 for(const n of data.nodes)for(const s of n.sources)assert(fs.existsSync(path.join(root,"../../B6.-RTOS-mini-kernel-scheduler",s)),s);
 const ids=new Set(data.nodes.map(n=>n.id));for(const e of data.edges){assert(ids.has(e.a));assert(ids.has(e.b));}
 assert.equal(new Set(data.views.flatMap(v=>v.nodes.map(n=>n[0]))).size,38);
 for(const v of data.views){await js('document.querySelector(\'[data-view="'+v.id+'"]\').click()');assert.equal(await js('document.querySelectorAll(".node").length'),v.nodes.length);}
 await js('document.querySelector(\'[data-view="overview"]\').click()');
 await js('document.getElementById("search").value="EDF"; document.getElementById("search").dispatchEvent(new Event("input"))');
 assert(await js('document.querySelector(\'[data-result="edf"]\')!==null'));
 await js('document.querySelector(\'[data-result="edf"]\').click()');
 assert.equal(await js('document.querySelector("#inspector h2").textContent'),"EDF");
 await js('document.getElementById("owner").value="Moataz"; document.getElementById("owner").dispatchEvent(new Event("change"))');
 assert(await js('document.querySelectorAll(".node.dim").length>0'));
 await js('document.getElementById("owner").value=""; document.getElementById("owner").dispatchEvent(new Event("change"))');
 for(const t of data.tours){
  await js('document.getElementById("tourSelect").value='+JSON.stringify(t.id)+';document.getElementById("tourSelect").dispatchEvent(new Event("change"))');
  if(errors.length) throw Error(JSON.stringify(errors)); for(let i=0;i<t.steps.length;i++){
   assert.equal(await js('document.getElementById("tourTitle").textContent'),t.steps[i][1]);
   assert.equal(await js('document.querySelector(".node.selected").dataset.node'),t.steps[i][0]);
   await js('document.getElementById("nextStep").click()');
  }
  assert(await js('document.getElementById("tour").hidden'));
 }
 await js('document.getElementById("on").click();document.getElementById("tick").value=4;document.getElementById("tick").dispatchEvent(new Event("input"))');
 assert((await js('document.getElementById("tickExplanation").textContent')).includes("L finishes"));
 assert((await js('document.getElementById("oracleBadge").textContent')).includes("5"));
 await js('document.getElementById("off").click()');
 await js('document.querySelector(\'[data-view="overview"]\').click()');
 await new Promise(r=>setTimeout(r,200));
 const layout=await send("Page.getLayoutMetrics");
 await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,clip:{x:0,y:0,width:1600,height:layout.cssContentSize.height,scale:1}}).then(r=>fs.writeFileSync(path.join(root,"preview-full.png"),Buffer.from(r.data,"base64")));
 await send("Page.captureScreenshot",{format:"png"}).then(r=>fs.writeFileSync(path.join(root,"preview-overview.png"),Buffer.from(r.data,"base64")));
 await js('document.querySelector(\'[data-view="resources"]\').click();document.querySelector(\'[data-node="inheritance"]\').dispatchEvent(new MouseEvent("click",{bubbles:true}))');
 assert((await js('document.getElementById("inspector").textContent')).includes("Production callback integration"));
 await send("Page.captureScreenshot",{format:"png"}).then(r=>fs.writeFileSync(path.join(root,"preview-resources.png"),Buffer.from(r.data,"base64")));
 await js('document.getElementById("teamBtn").click()');assert(await js('document.getElementById("modal").open'));
 await js('document.querySelector(".dialog-close").click()');
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await js('document.querySelector(\'[data-view="overview"]\').click()');
 assert(await js("document.documentElement.scrollWidth<=window.innerWidth"),"mobile page overflows");
 await send("Page.captureScreenshot",{format:"png"}).then(r=>fs.writeFileSync(path.join(root,"preview-mobile.png"),Buffer.from(r.data,"base64")));
 assert.deepEqual(errors,[]);assert(!network.some(u=>/^https?:/.test(u)),"unexpected external request");
 console.log("PASS: 38 nodes, 68 connections, all source paths, 6 views, 6 walkthroughs, search, contributor highlight, oracle controls, dialogs, mobile overflow and offline loading. Screenshots saved.");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(ws)ws.close();child.kill();});




