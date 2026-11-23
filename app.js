"use strict";
const D=window.ATLAS, byId=Object.fromEntries(D.nodes.map(n=>[n.id,n]));
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const colors={Moataz:"#208276",Youssef:"#537eba",Marc:"#8a6ab0",Sarofem:"#b17b31",Bavly:"#b66e81",Team:"#637c87"};
const edgeColors={flow:"#318c7c",owns:"#5c88bc",reference:"#96a3aa",mutation:"#bd8c49",gap:"#c65b6d"};
const ownerColor=n=>colors[n.owner.split(" ")[0]]||"#637c87";
let currentView=D.views[0],selected=null,filter="",zoom=1,panX=0,panY=0,tour=null,step=0,mode="off";
// Keep disk use convenient; published pages link to the inspected Git revision.
const sourceRoot=location.protocol==="file:" ? "../../B6.-RTOS-mini-kernel-scheduler/" : "https://github.com/bavly-bob/B6.-RTOS-mini-kernel-scheduler/blob/73fead4/";
$("views").innerHTML=D.views.map((v,i)=>'<button data-view="'+v.id+'">'+String(i+1).padStart(2,"0")+' '+esc(v.name)+'</button>').join("");
$("views").addEventListener("click",ev=>{const b=ev.target.closest("[data-view]");if(b){stopTour();setView(b.dataset.view);}});
$("tourSelect").innerHTML += D.tours.map(t=>'<option value="'+t.id+'">'+esc(t.title)+'</option>').join("");
function setView(id,keep=false){
 currentView=D.views.find(v=>v.id===id)||D.views[0];selected=keep?selected:null;
 document.querySelectorAll("[data-view]").forEach(b=>{b.classList.toggle("active",b.dataset.view===currentView.id);b.setAttribute("aria-current",b.dataset.view===currentView.id?"page":"false");});
 $("viewIndex").textContent="MAP "+String(D.views.indexOf(currentView)+1).padStart(2,"0")+" / 06";
 $("viewTitle").textContent=currentView.name;$("viewDesc").textContent=currentView.desc;
 history.replaceState(null,"","#"+currentView.id);fit();renderGraph();renderInspector();
}
function transform(){$("scene").setAttribute("transform","translate("+panX+" "+panY+") translate(665 310) scale("+zoom+") translate(-665 -310)");}
function fit(){zoom=1;panX=0;panY=0;transform();}
$("fit").onclick=fit;
$("zoomIn").onclick=()=>{zoom=Math.min(2.6,zoom*1.2);transform();};
$("zoomOut").onclick=()=>{zoom=Math.max(.65,zoom/1.2);transform();};
function renderGraph(){
 const pos=Object.fromEntries(currentView.nodes.map(([id,c,r])=>[id,{x:30+c*262,y:45+r*180}]));
 const visible=D.edges.filter(e=>pos[e.a]&&pos[e.b]);
 const neighbors=new Set(selected?[selected,...D.edges.filter(e=>e.a===selected||e.b===selected).flatMap(e=>[e.a,e.b])]:[]);
 const ownerMatches=id=>!filter||byId[id].owner.includes(filter)||byId[id].owner==="Team";
 let out='<defs>'+Object.entries(edgeColors).map(([k,c])=>'<marker id="arrow-'+k+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="'+c+'"/></marker>').join("")+'</defs>';
 for(const e of visible){
  let a=pos[e.a],b=pos[e.b],sx,sy,tx,ty,path;
  if(a.x!==b.x){const dir=b.x>a.x?1:-1;sx=a.x+(dir>0?212:0);sy=a.y+47;tx=b.x+(dir>0?0:212);ty=b.y+47;const bend=Math.max(30,Math.abs(tx-sx)*.48);path='M'+sx+','+sy+' C'+(sx+dir*bend)+','+sy+' '+(tx-dir*bend)+','+ty+' '+tx+','+ty;}
  else{const dir=b.y>a.y?1:-1;sx=a.x+106;sy=a.y+(dir>0?96:0);tx=b.x+106;ty=b.y+(dir>0?0:96);path='M'+sx+','+sy+' C'+sx+','+(sy+dir*45)+' '+tx+','+(ty-dir*45)+' '+tx+','+ty;}
  const focus=selected&&(e.a===selected||e.b===selected);
  const dim=(selected&&!focus)||(filter&&!ownerMatches(e.a)&&!ownerMatches(e.b));
  out+='<path class="edge '+(focus?'focused':'')+(dim?' dim':'')+'" stroke="'+edgeColors[e.type]+'" '+(["gap","reference"].includes(e.type)?'stroke-dasharray="5 5"':'')+' marker-end="url(#arrow-'+e.type+')" d="'+path+'"/>';
  if(focus)out+='<text class="edge-label focused" text-anchor="middle" x="'+((sx+tx)/2)+'" y="'+((sy+ty)/2-7)+'">'+esc(e.label)+'</text>';
 }
 for(const [id,p] of Object.entries(pos)){
  const n=byId[id],dim=(selected&&!neighbors.has(id))||!ownerMatches(id);
  out+='<g class="node '+(selected===id?'selected ':'')+(dim?'dim':'')+'" data-node="'+id+'" tabindex="0" role="button" aria-label="'+esc(n.title+". "+n.owner+". "+n.summary)+'" transform="translate('+p.x+' '+p.y+')"><rect class="card" width="212" height="96" rx="10"/><rect x="0" y="17" width="3" height="61" rx="1.5" fill="'+ownerColor(n)+'"/><text class="node-title" x="14" y="26">'+esc(n.title)+'</text><text class="node-sub" x="14" y="46">'+esc(n.sub)+'</text><circle cx="18" cy="74" r="3" fill="'+ownerColor(n)+'"/><text class="node-owner" x="27" y="78" fill="'+ownerColor(n)+'">'+esc(n.owner)+'</text>'+(n.status!=="implemented"?'<circle cx="193" cy="15" r="4" fill="'+(n.status==="gap"?"#c65b6d":"#bf9750")+'"/>':'')+'</g>';
 }
 $("scene").innerHTML=out;transform();
 // Keep long component names inside their cards at every browser font setting.
 document.querySelectorAll(".node-title").forEach(label=>{const width=label.getComputedTextLength();if(width>184)label.style.fontSize=(15*184/width)+"px";});
 document.querySelectorAll(".node").forEach(el=>{
  el.onclick=()=>selectNode(el.dataset.node);
  el.onkeydown=ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();selectNode(el.dataset.node);}};
  el.onpointerenter=ev=>showTooltip(el.dataset.node,ev);
  el.onpointermove=ev=>showTooltip(el.dataset.node,ev);
  el.onpointerleave=()=>{$("tooltip").hidden=true;};
 });
}
function selectNode(id,switchView=true){
 if(switchView&&!currentView.nodes.some(x=>x[0]===id)){const v=D.views.find(v=>v.nodes.some(x=>x[0]===id));if(v)setView(v.id);}
 selected=id;$("tooltip").hidden=true;renderGraph();renderInspector();$("inspector").scrollTop=0;
}
function showTooltip(id,ev){
 const n=byId[id],box=$("graphWrap").getBoundingClientRect(),tip=$("tooltip");
 tip.innerHTML='<strong>'+esc(n.title)+'</strong>'+esc(n.summary)+'<small>'+esc(n.owner)+' · Click for fields, integration and source files</small>';tip.hidden=false;
 tip.style.left=Math.max(8,Math.min(ev.clientX-box.left+13,box.width-280))+"px";
 tip.style.top=Math.max(8,Math.min(ev.clientY-box.top+14,box.height-tip.offsetHeight-12))+"px";
}
function renderInspector(){
 if(!selected){$("inspector").innerHTML='<div class="eyebrow">YOUR GUIDE TO THE CONNECTIONS</div><h2>Start anywhere.<br>Follow the arrows.</h2><p class="summary">Select a component to see what it does, who built it, what it changes and how it connects.</p><h3>Suggested first path</h3><div class="connections">'+["task","job","scheduler","resources","dashboard"].map(id=>'<button data-pick="'+id+'">→ <span>'+esc(byId[id].title)+'<small>'+esc(byId[id].sub)+'</small></span></button>').join("")+'</div><h3>Read the map accurately</h3><p>A queue usually borrows a Job pointer. The Registry still owns the Job. An orange arrow identifies a state mutation, not a transfer of memory ownership.</p><div class="detail-box"><p><b>Current gap:</b> production priority inheritance still needs its scheduler callback. Resource-level donation is implemented.</p></div><p class="small">Use search for all 38 components. Hover for a quick explanation; click to keep it open. Walkthroughs explain one operation in order.</p>';wirePicks();return;}
 const n=byId[selected],rel=D.edges.filter(e=>e.a===selected||e.b===selected);
 const status={implemented:"Implemented component",component:"Component works · integration pending",gap:"Missing production connection",separate:"Separate / outside active path"};
 $("inspector").innerHTML='<div class="owner-chip"><i style="background:'+ownerColor(n)+'"></i>'+esc(n.owner)+'</div><h2>'+esc(n.title)+'</h2><span class="badge '+(n.status!=="implemented"?"warn":"")+'">'+status[n.status]+'</span><p class="summary">'+esc(n.summary)+'</p><h3>How it works</h3><ul>'+n.details.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ul><h3>What changes</h3><div class="detail-box"><p>'+esc(n.mutations)+'</p></div><h3>Make it concrete</h3><p>'+esc(n.example)+'</p><h3>Cost / limits</h3><p>'+esc(n.cost)+'</p><h3>Connected components · '+rel.length+'</h3><div class="connections">'+rel.map(e=>{const outgoing=e.a===selected,id=outgoing?e.b:e.a;return '<button data-pick="'+id+'"><span style="color:'+edgeColors[e.type]+'">'+(outgoing?'→':'←')+'</span><span>'+esc(byId[id].title)+'<small>'+esc(e.label)+' · '+esc(e.type)+'</small>'+(e.type==="gap"?'<small>'+esc(e.note)+'</small>':'')+'</span></button>';}).join("")+'</div><h3>Source references</h3>'+n.sources.map(s=>'<a class="source" href="'+sourceRoot+encodeURI(s)+'" target="_blank" rel="noopener">'+esc(s)+' ↗</a>').join("")+'<p class="small">Links point to the adjacent local repository. Some browsers download source files instead of displaying them. Ownership labels use the plan and Git history; integration is often shared.</p>';
 wirePicks();
}
function wirePicks(){$("inspector").querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>selectNode(b.dataset.pick));}
$("owner").onchange=()=>{filter=$("owner").value;renderGraph();};
$("search").oninput=()=>{
 const q=$("search").value.trim().toLowerCase();$("results").hidden=!q;
 if(!q)return;
 const alias={tcp:"tcb",adf:"edf",dex:"edf",yusuf:"youssef",mark:"marc"};
 const term=alias[q]||q;
 const found=D.nodes.filter(n=>[n.title,n.sub,n.owner,n.summary,...n.details].join(" ").toLowerCase().includes(term)).slice(0,12);
 $("results").innerHTML=found.length?found.map(n=>'<button data-result="'+n.id+'">'+esc(n.title)+'<small>'+esc(n.owner)+' · '+esc(n.sub)+'</small></button>').join(""):'<p class="small" style="padding:10px">No matching component. Try a concept or contributor name.</p>';
};
$("results").onclick=ev=>{const b=ev.target.closest("[data-result]");if(b){selectNode(b.dataset.result);$("search").value="";$("results").hidden=true;}};
$("search").onkeydown=ev=>{if(ev.key==="Escape")$("results").hidden=true;if(ev.key==="Enter"){const b=$("results").querySelector("button");if(b)b.click();}};
document.addEventListener("click",ev=>{if(!ev.target.closest(".search"))$("results").hidden=true;});
let drag=null,moved=false;
$("graph").addEventListener("pointerdown",ev=>{if(ev.target.closest(".node"))return;drag={x:ev.clientX,y:ev.clientY,px:panX,py:panY};moved=false;$("graph").setPointerCapture(ev.pointerId);});
$("graph").addEventListener("pointermove",ev=>{if(!drag)return;const k=1330/$("graph").getBoundingClientRect().width;const dx=(ev.clientX-drag.x)*k,dy=(ev.clientY-drag.y)*k;moved=moved||Math.abs(dx)+Math.abs(dy)>3;panX=drag.px+dx;panY=drag.py+dy;transform();});
$("graph").addEventListener("pointerup",()=>{if(drag&&!moved){selected=null;renderGraph();renderInspector();}drag=null;});
$("graph").addEventListener("pointercancel",()=>drag=null);
function showStep(){
 const s=tour.steps[step];if(currentView.id!==tour.view)setView(tour.view);
 selectNode(s[0]);$("tour").hidden=false;$("tourCount").textContent="STEP "+(step+1)+" OF "+tour.steps.length;
 $("tourTitle").textContent=s[1];$("tourText").textContent=s[2];$("prevStep").disabled=step===0;$("nextStep").textContent=step===tour.steps.length-1?"Finish ✓":"Next step →";
}
function stopTour(){tour=null;step=0;$("tour").hidden=true;$("tourSelect").value="";}
$("tourSelect").onchange=()=>{tour=D.tours.find(t=>t.id===$("tourSelect").value);step=0;if(tour)showStep();else stopTour();};
$("prevStep").onclick=()=>{if(step>0){step--;showStep();}};
$("nextStep").onclick=()=>{if(step<tour.steps.length-1){step++;showStep();}else stopTour();};
$("closeTour").onclick=stopTour;
const questions=[
["Is this a real operating system?","It is a C++ simulation of a small single-CPU real-time kernel. Time is integer ticks; context-switch and resource-operation costs are modeled as zero. It does not control real hardware."],
["Task, Job and TCB: what is the difference?","TaskSpec is a reusable definition. TCB is an alias for TaskSpec here. A Job is one release, with its own deadline and progress. Multiple unfinished Jobs can refer to the same task."],
["Who owns a Job when it is in a queue?","Registry always owns it. Ready and wait queues borrow pointers. A queue owns its own list nodes; deleting a node does not delete the Job."],
["What is the mutex / semaphore difference?","A mutex has one exclusive owner, and only that owner unlocks. A semaphore tracks permits with no owner. SIGNAL can directly complete a waiting task's WAIT without increasing count."],
["Is the timing wheel the sleep backend?","No. Production timers use sortedList or MinHeap behind TimerQueue. The timing wheel is a separate tested experiment. AVL is documented as out of scope."],
["Does the website prove the algorithms work?","No. It displays recorded evidence. Automated tests compare actual behavior with expectations. Hand-authored examples must be labelled as samples; production inheritance ON still has a callback gap in this revision."]
];
$("questions").innerHTML=questions.map(([q,a],i)=>'<details '+(i===0?'open':'')+'><summary>'+esc(q)+'</summary><p>'+esc(a)+'</p></details>').join("");
function drawOracle(){
 const t=Number($("tick").value),on=mode==="on",seq=on?["L","L","L","L","H","M","M","M","M","idle"]:["L","L","M","M","M","M","L","L","H","idle"];
 $("off").setAttribute("aria-pressed",String(!on));$("on").setAttribute("aria-pressed",String(on));$("tickValue").textContent=t;
 $("oracleBadge").textContent=on?"Expected H completion: 5":"Expected H completion: 9";
 $("timeline").innerHTML=seq.map((x,i)=>'<div class="slice '+x.toLowerCase()+(i===t?' current':'')+'" data-t="'+i+'" title="['+i+','+(i+1)+'): '+x+'">'+x+'</div>').join("");
 let text;
 if(t===0)text="L locks R and runs. H has not released yet. L owns the mutex at base priority 1.";
 else if(on&&t<4)text=t===1?"H releases, tries LOCK R and blocks. L inherits priority 3; base priority stays 1. L continues running.":"M has released at priority 2, but L is running at inherited priority 3. M cannot delay L's release of the mutex.";
 else if(on&&t===4)text="L finishes its 4 CPU ticks, unlocks and returns to priority 1. H receives R directly and runs [4,5).";
 else if(on&&t>=5)text="H has completed at 5, before its absolute deadline 6. M runs [5,9), then the CPU is idle. This is the expected component oracle.";
 else if(t===1)text="H releases and blocks on L's mutex. With inheritance OFF, L remains priority 1 and continues for now.";
 else if(t<6)text="M runs at priority 2 while H waits for R. L owns R but has priority 1, so M delays the work H depends on.";
 else if(t<8)text="At tick 6, H misses its deadline. M is done, so L resumes and finishes its remaining 2 ticks. H is still blocked.";
 else if(t===8)text="L unlocks R at 8. H receives ownership and runs [8,9). The earlier deadline miss remains recorded.";
 else text="H has completed at 9; the CPU is idle. Its response time is 9 − release 1 = 8 ticks.";
 $("tickExplanation").textContent=text;
}
$("off").onclick=()=>{mode="off";drawOracle();};$("on").onclick=()=>{mode="on";drawOracle();};$("tick").oninput=drawOracle;
function modal(content){$("modalContent").innerHTML=content;$("modal").showModal();}
$("modal").querySelector(".dialog-close").onclick=()=>$("modal").close();
$("modal").onclick=e=>{if(e.target===$("modal"))$("modal").close();};
$("teamBtn").onclick=()=>modal('<div class="eyebrow">OWNERSHIP & SOURCE NOTES</div><h2>Five contributors. Shared contracts.</h2><div class="team-list">'+[
["Youssef Gohar","Clock, ready queues, bitmap integration, fixed-priority/RR dispatch, scheduler and CLI. Integrates EDF and manager hooks."],
["Moataz","Shared types, task/job registry, validation, mutexes, semaphores, donation/restoration and resource state transitions."],
["Marc","Min-heap and EDF entry support, RM priority assignment, metrics, policy comparisons and experiment implementation."],
["Sarofem","Sorted list / DynamicArray, timer adapters, bounded trace and JSON export; reviews heap/metrics and timer experiments."],
["Bavly","Timing-wheel repair, dashboard, imports/fixtures, browser checks and demonstration documentation."]
].map(([name,desc])=>'<article><h3>'+esc(name)+'</h3><p>'+esc(desc)+'</p></article>').join("")+'</div><h3>What the labels mean</h3><p>Primary responsibilities follow the B6 Project Completion Plan (pages 20–22) and current Git history. Shared integration is labelled explicitly; an owner label does not mean that person authored every line.</p><h3>Snapshot, not a live status monitor</h3><p>Source revision <code>73fead4</code>, inspected 23 November 2026. Source code takes precedence over stale notes: some older guides still call implemented features “pending.” The priority callback gap is visible in the actual headers and implementation.</p><p>The atlas is a separate teaching website. No scheduler or teammate files were edited. The illustrative timelines are hand-authored expectations, not newly executed engine traces.</p><p class="small">The plan names Bavly, Marc and Youssef Gohar. No separate “David” owner is assigned. TCB and EDF are the project terms, rather than TCP and ADF.</p>');
$("helpBtn").onclick=()=>modal('<div class="eyebrow">A FIVE-MINUTE ROUTE</div><h2>Explore without getting lost</h2><ol><li>Start with <b>Whole system</b>: input → engine → recording → dashboard.</li><li>Hover any card for a short definition. Click it for ownership, field mutations, examples, complexity and source links.</li><li>Click a connection in the inspector to move to the related component, even in another view.</li><li>Use search across all 38 components, or highlight one contributor.</li><li>Choose a walkthrough for releases, mutex blocking, donation, semaphores, sleep or export.</li><li>Compare OFF/ON below the graph, then rehearse the six discussion answers.</li></ol><p>Blue lines mean storage ownership. Gray dashes mean borrowed references or verification. Orange lines mean mutation. Coral dashes show a missing integration path. Arrow labels appear around the selected component.</p><p>Drag empty canvas to pan; use +, − or Fit. Cards work with keyboard focus and Enter. No internet or server is needed.</p>');
document.querySelector(".brand").onclick=e=>{e.preventDefault();stopTour();setView("overview");};
setView(D.views.some(v=>v.id===location.hash.slice(1))?location.hash.slice(1):"overview");drawOracle();

