(function () {
  "use strict";
  const data = window.STACKING_DATA;
  const { compute } = window.StackingCalc;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined ? "–" : isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "never");
  const mins = (m) => (m === null ? "never" : m === 0 ? "from the start" : `${fmt(m, 1)} min`);

  const EVIL = "ARAM_PhenomenalEvil";
  // A strong Veigar game: lots of poke, a takedown every 40 seconds, Phenomenal Evil second.
  const PRESET = { champion: "Veigar", minutes: 25, rates: { hits: 10, takedowns: 1.5 }, extra: 300, target: 500, evil: { on: true, second: true, rate: 10 } };
  const EMPTY = { champion: "Veigar", minutes: 20, rates: {}, extra: 0, target: 0, evil: { on: false, second: false, rate: 6 } };

  let build = load() || structuredClone(EMPTY);
  const champOf = () => data.champions.find((c) => c.alias === build.champion) || data.champions[0];

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "on") e.addEventListener("click", v);
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids) e.append(k);
    return e;
  }

  function pickButton(thing, sub, on, click) {
    return el("button", { class: on ? "pick on" : "pick", title: thing.text || thing.name, "aria-pressed": on ? "true" : "false", on: click },
      el("img", { src: thing.icon, alt: "", loading: "lazy" }), el("span", {}, thing.name, el("span", { class: "tier" }, sub)));
  }

  function numberRow(label, value, { max = 1e4, step = 1 } = {}, set) {
    const input = el("input", { type: "number", min: 0, max, step, value, inputmode: "decimal" });
    input.addEventListener("input", () => { set(Math.max(0, Math.min(max, +input.value || 0))); update(false); });
    return el("label", {}, label, input);
  }

  function checkRow(label, checked, set) {
    const input = el("input", { type: "checkbox", checked });
    input.addEventListener("input", () => { set(input.checked); update(); });
    return el("label", {}, label, input);
  }

  function renderControls() {
    const c = champOf();
    $("champ-picker").replaceChildren(...data.champions.map((ch) => pickButton(ch, `${ch.stackName} · ${fmt(ch.perStack, 2)} ${ch.unit} per stack`, ch.alias === c.alias,
      () => { if (ch.alias !== build.champion) { build.champion = ch.alias; build.rates = {}; build.extra = 0; } update(); })));

    const rows = c.events.map((e) => numberRow(`${e.label} per minute (${fmt(e.stacks)} ${e.stacks === 1 ? "stack" : "stacks"} each)`,
      build.rates[e.key] ?? e.rate, { max: 60, step: 0.5 }, (v) => { build.rates[e.key] = v; }));
    if (c.ability) rows.push(numberRow(`Bonus ${c.ability.stat} from items and augments`, build.extra || 0, { step: 10 }, (v) => { build.extra = v; }));
    rows.push(numberRow("Stack goal", build.target || 0, { max: 1e5, step: 10 }, (v) => { build.target = v; }));
    $("options").replaceChildren(...rows);

    const aug = data.augments.find((a) => a.key === EVIL);
    $("aug-picker").replaceChildren(pickButton(aug, `${aug.tier} · +${fmt(aug.values.APPerProc)} AP per ability hit`, build.evil.on,
      () => { build.evil.on = !build.evil.on; update(); }));
    $("aug-options").replaceChildren(...(build.evil.on ? [
      numberRow("Ability hits on champions per minute", build.evil.rate ?? 6, { max: 60, step: 0.5 }, (v) => { build.evil.rate = v; }),
      checkRow(`Taken as second augment (+${fmt(aug.values.StartingAPIfSecondAugment)} AP)`, !!build.evil.second, (v) => { build.evil.second = v; }),
    ] : []));
  }

  function renderResult(r) {
    const c = r.champion;
    $("champ-icon").src = c.icon;
    $("unit-label").textContent = c.unit === "AP" && r.evil ? "AP from stacks and Phenomenal Evil" : `${c.unit} from stacks`;
    $("minutes-label").textContent = fmt(r.minutes);
    $("stat").textContent = fmt(r.now.stat);
    $("rate").textContent = fmt(r.perMinute, 1);
    $("rate-note").textContent = r.events.map((e) => `${e.label}: ${fmt(e.perMinute, 1)} stacks`).join(" · ");

    drawChart(r);
    const stats = [["Stacks", fmt(r.now.stacks)]];
    if (r.now.ability !== null) stats.push([c.ability.name, `${fmt(r.now.ability)} damage`]);
    if (r.now.tiers) stats.push(["Bonus range", `+${fmt(r.now.tiers.range)}`], ["Bonus crit", `+${fmt(r.now.tiers.crit * 100)}%`]);
    if (r.evil) stats.push(["Phenomenal Evil AP", fmt(r.evil.total)]);
    for (const m of r.milestones) stats.push([`${m.label} (${fmt(m.at)})`, mins(m.minute)]);
    if (r.target) stats.push([`${fmt(r.target.stacks)} stacks`, mins(r.target.minute)]);
    $("stats").replaceChildren(...stats.map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", {}, v))));

    const head = ["Minute", "Stacks", c.unit];
    if (c.ability) head.push(c.ability.name.split(" (")[0]);
    if (c.tiers) head.push("Crit");
    const rows = r.checkpoints.map((p) => {
      const cells = [`${p.minute} min`, fmt(p.stacks), fmt(p.stat)];
      if (c.ability) cells.push(fmt(p.ability));
      if (c.tiers) cells.push(`+${fmt(p.tiers.crit * 100)}%`);
      return el("tr", {}, ...cells.map((v) => el("td", {}, v)));
    });
    $("timeline").replaceChildren(el("tr", {}, ...head.map((h) => el("th", {}, h))), ...rows);
  }

  function drawChart(r) {
    const svg = $("chart"), pts = r.series;
    const max = Math.max(...pts);
    if (!max) { svg.replaceChildren(); return; }
    const x = (i) => (i / (pts.length - 1)) * 300;
    const y = (v) => 78 - (v / max) * 72;
    const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const ns = "http://www.w3.org/2000/svg";
    const mk = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const now = (r.minutes / r.end) * 300;
    svg.replaceChildren(mk("line", { class: "cap", x1: now, x2: now, y1: 0, y2: 80 }), mk("path", { class: "area", d: `${line}L300,80L0,80Z` }), mk("path", { class: "line", d: line }));
    svg.setAttribute("aria-label", `${r.champion.unit} from stacks over ${r.end} minutes, ${fmt(r.now.stat)} at ${fmt(r.minutes)} minutes`);
  }

  function update(rerender = true) {
    if (rerender) renderControls();
    $("minutes").value = build.minutes;
    $("minutes-out").textContent = `${build.minutes} min`;
    renderResult(compute(data, build));
    save();
  }

  function save() {
    try { history.replaceState(null, "", `#${encodeURIComponent(JSON.stringify(build))}`); } catch { /* embedded pages may not own the URL */ }
  }

  function load() {
    try {
      const b = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      if (!b || !data.champions.some((c) => c.alias === b.champion)) return null;
      return { ...structuredClone(EMPTY), ...b, evil: { ...EMPTY.evil, ...(b.evil || {}) }, rates: b.rates || {} };
    } catch {
      return null;
    }
  }

  $("patch").textContent = `Game data: patch ${data.patch.split(".").slice(0, 2).join(".")}.`;
  $("minutes").addEventListener("input", (e) => { build.minutes = +e.target.value; update(false); });
  $("preset").addEventListener("click", () => { build = structuredClone(PRESET); update(); });
  $("reset").addEventListener("click", () => { build = structuredClone(EMPTY); update(); });
  $("share").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Link copied"; }
    catch { e.target.textContent = "Copy the address bar"; }
    setTimeout(() => (e.target.textContent = "Copy link"), 1500);
  });
  update();
})();
