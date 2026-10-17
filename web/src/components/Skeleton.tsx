// Placeholder shapes shown while something loads, in roughly the layout it will have, so the page
// doesn't jump when it arrives. The shimmer stops under reduced motion (globals.css).

type Kind = "table" | "cards" | "slots" | "chart";

export default function Skeleton({ kind = "table", rows = 6, label = "Loading…" }: { kind?: Kind; rows?: number; label?: string }) {
  return (
    <div className={`skel skel-${kind}`} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {kind === "table" &&
        Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skel-row" aria-hidden="true">
            <i className="skel-dot" />
            <i style={{ width: `${45 + ((i * 17) % 30)}%` }} />
            <i className="skel-num" />
            <i className="skel-num" />
          </div>
        ))}
      {kind === "cards" &&
        Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skel-card" aria-hidden="true">
            <i className="skel-title" />
            <i />
            <i style={{ width: "70%" }} />
            <i style={{ width: "85%" }} />
          </div>
        ))}
      {kind === "slots" && (
        <>
          <div className="skel-tiles" aria-hidden="true">
            {Array.from({ length: rows }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <div className="skel-card" aria-hidden="true">
            <i className="skel-title" />
            <i />
            <i style={{ width: "60%" }} />
          </div>
        </>
      )}
      {kind === "chart" && <div className="skel-chart" aria-hidden="true" />}
    </div>
  );
}
