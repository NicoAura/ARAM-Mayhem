// Runs the WebAssembly build of mayhem_sim (make wasm-mayhem) off the page's main thread.
// Messages in: {id, args}. Messages out: {id, ok, stdout, stderr, trace}.
"use strict";
const BUST = self.location.search;
importScripts("replay-data/mayhem_sim.js" + BUST);

let ready = MayhemSim({
  locateFile: (path) => "replay-data/" + path + BUST,
  print: (s) => { out.push(s); },
  printErr: (s) => { err.push(s); },
});
let out = [], err = [];

self.onmessage = async (e) => {
  const { id, args } = e.data;
  const sim = await ready;
  out = []; err = [];
  let ok = true, trace = null;
  try {
    try { sim.FS.unlink("/trace.json"); } catch (x) { /* none yet */ }
    const code = sim.callMain(args);
    ok = code === 0 || code === undefined;
    try { trace = sim.FS.readFile("/trace.json", { encoding: "utf8" }); } catch (x) { trace = null; }
  } catch (x) {
    ok = false;
    err.push(String(x && x.message ? x.message : x));
  }
  self.postMessage({ id, ok: ok && !err.some((l) => l.startsWith("error")), stdout: out.join("\n"), stderr: err.join("\n"), trace });
};
