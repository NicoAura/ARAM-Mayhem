import type { RadarAxis } from "@/lib/champions";

// A champion's live-patch profile: one spoke per stat, reaching as far as its percentile among all
// champions (the dashed ring is the middle of the pack), with its rank listed beside. Plain SVG.

const SIZE = 260;
const C = SIZE / 2;
const R = 96;

const point = (i: number, n: number, r: number) => {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
  return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const;
};

export default function ChampionRadar({ name, axes }: { name: string; axes: RadarAxis[] }) {
  const n = axes.length;
  if (n < 3) return null;
  const ring = (f: number) => axes.map((_, i) => point(i, n, R * f).join(",")).join(" ");
  // A small floor so a last-place stat still shows as a sliver.
  const shape = axes.map((a, i) => point(i, n, R * (0.06 + 0.94 * a.pct)).join(",")).join(" ");
  return (
    <section className="card span-all radar-card" data-accent="sim">
      <div className="card-head">
        <h2>{name}&apos;s profile</h2>
        <span className="card-note">live patch, vs every champion</span>
      </div>
      <div className="radar">
        <svg viewBox={`-56 -6 ${SIZE + 112} ${SIZE + 12}`} role="img" aria-label={`${name}'s stat profile: ${axes.map((a) => `${a.label} rank ${a.rank} of ${a.of}`).join(", ")}`}>
          {[0.25, 0.75, 1].map((f) => (
            <polygon key={f} points={ring(f)} className="radar-grid" />
          ))}
          <polygon points={ring(0.5)} className="radar-mid" />
          {axes.map((a, i) => {
            const [x, y] = point(i, n, R);
            return <line key={a.key} x1={C} y1={C} x2={x} y2={y} className="radar-grid" />;
          })}
          <polygon points={shape} className="radar-shape" />
          {axes.map((a, i) => {
            const [x, y] = point(i, n, R * (0.06 + 0.94 * a.pct));
            return (
              <circle key={a.key} cx={x} cy={y} r={3.5} className="radar-dot">
                <title>{`${a.label}: ${a.value}, #${a.rank} of ${a.of}`}</title>
              </circle>
            );
          })}
          {axes.map((a, i) => {
            const [x, y] = point(i, n, R + 18);
            return (
              <text key={a.key} x={x} y={y} textAnchor={Math.abs(x - C) < 4 ? "middle" : x > C ? "start" : "end"} dominantBaseline="middle" className="radar-label">
                {a.label}
              </text>
            );
          })}
        </svg>
        <dl className="radar-ranks">
          {axes.map((a) => (
            <div key={a.key} title={a.hint}>
              <dt>{a.label}</dt>
              <dd>
                <b className={a.pct >= 0.75 ? "wr-high" : a.pct <= 0.25 ? "wr-low" : ""}>
                  #{a.rank}
                  <span> of {a.of}</span>
                </b>
                <span>{a.value}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
