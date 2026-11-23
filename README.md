# B6 Project Atlas

An interactive study guide to the B6 RTOS scheduler simulator: 38 components,
68 connections, contributor ownership, mutation boundaries and six walkthroughs.

Open `index.html` directly for offline use, or deploy this directory as a static
site on Vercel with no framework or build step. No dependencies are needed to run it.

The source snapshot is `73fead4` of
[the B6 scheduler](https://github.com/bavly-bob/B6.-RTOS-mini-kernel-scheduler).
Status explanations describe that revision; they are not live repository checks.
The inheritance timelines are labelled teaching examples, not engine executions.

## Files

- `index.html`: page structure and mutation table.
- `style.css`: responsive styling.
- `data.js`: component descriptions, graph connections and walkthroughs.
- `app.js`: interactive SVG maps, search, inspection and timeline controls.
- `check.cjs`: offline browser smoke checks (Node 22+ and Chrome/Edge).

Production source links open GitHub at the inspected revision. Local file links
expect the scheduler repository beside the parent `output` folder.

Run the development checks with `node check.cjs` in the original workspace.
Screenshots and local Vercel configuration are excluded from Git.
