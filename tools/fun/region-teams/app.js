(function () {
  const data = window.REGION_DATA;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = (path) => (window.FUN_ICONS && window.FUN_ICONS[path]) || path;
  const pct = (x) => (x * 100).toFixed(1) + "%";
  // A win rate coloured by how it does: 52% or more good, 48% or less bad.
  const wr = (x) => `<span class="${x >= 0.52 ? "good" : x <= 0.48 ? "bad" : ""}">${pct(x)}</span>`;
  const names = {};
  for (const r of data.regions) for (const c of r.champions) names[c.alias] = c.name;

  function card(r, i) {
    const champs = r.champions.map((c) => `<li>
        <img src="${icon(c.icon)}" alt="" width="56" height="56" loading="lazy">
        <b>${esc(c.name)}</b>
        <span class="muted small">${esc(c.classes.join(" · "))}</span>
        <span class="mono">${wr(c.win_rate)}</span>
      </li>`).join("");
    const best = r.pairs[0];
    const pair = best && best.win_rate > 0.5 ? `<p class="small muted">Best pair: <b>${esc(names[best.a])} + ${esc(names[best.b])}</b> win ${wr(best.win_rate)} together.</p>` : "";
    return `<article class="region" id="${esc(r.key)}">
      <div class="region-head">
        <span class="rank mono">#${i + 1}</span>
        <h2>${esc(r.name)}</h2>
        <span class="team-wr"><span class="mono">${wr(r.win_rate)}</span><span class="label">average win rate</span></span>
      </div>
      <ul class="team">${champs}</ul>
      ${pair}${r.frontline ? "" : `<p class="small warn">${esc(r.name)} has no Tank or Fighter, so nobody stands up front.</p>`}
      <p class="small muted">Picked from ${r.size} ${esc(r.name)} champions.</p>
    </article>`;
  }

  document.getElementById("regions").innerHTML = data.regions.map(card).join("");
  document.getElementById("patch").textContent = "Patch " + data.patch.split(".").slice(0, 2).join(".") + ".";
  document.getElementById("footer").innerHTML = `
    <p><b>How a team is picked:</b> every five-champion team from the region is scored by each champion's Mayhem win rate above 50%, plus how much better each pair in the team wins together. A team needs someone up front (a Tank or Fighter), someone for damage (a Mage, Marksman or Slayer), and at most two Marksmen. A region with no Tank or Fighter plays without one.</p>
    <p>Regions come from each champion's official home; Runeterra is the champions with no single home. Champions from two regions can play for both.</p>`;
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
})();
