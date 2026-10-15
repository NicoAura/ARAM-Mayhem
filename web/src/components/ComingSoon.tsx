// Placeholder card that hints at the layout a section will have once its data is wired up.
export default function ComingSoon({
  label,
  variant,
}: {
  label: string;
  variant: "table" | "form" | "list";
}) {
  return (
    <section className="card filled coming-soon enter" style={{ animationDelay: "80ms" }}>
      <div className="linear-progress" role="progressbar" aria-label={label}>
        <span />
      </div>
      <p className="title-small on-variant">{label}</p>
      {variant === "table" && (
        <div className="skeleton-table">
          <div className="skeleton-row header">
            <span className="label-medium">Champion</span>
            <span className="label-medium">Win rate</span>
            <span className="label-medium">Games</span>
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton-row">
              <span className="skeleton-cell">
                <span className="skeleton avatar" />
                <span className="skeleton" style={{ width: `${70 - i * 6}%` }} />
              </span>
              <span className="skeleton bar" style={{ width: `${85 - i * 9}%` }} />
              <span className="skeleton short" />
            </div>
          ))}
        </div>
      )}
      {variant === "form" && (
        <div className="skeleton-form">
          <div className="skeleton-fields">
            {["Champion", "Items", "Augments", "Target"].map((f) => (
              <div key={f} className="text-field">
                <span className="text-field-label">{f}</span>
              </div>
            ))}
            <span className="btn filled disabled">Simulate</span>
          </div>
          <div className="skeleton-chart">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} className="column" style={{ height: `${25 + ((i * 37) % 70)}%` }} />
            ))}
          </div>
        </div>
      )}
      {variant === "list" && (
        <ul className="list">
          {["buff", "nerf", "change", "buff", "nerf"].map((tag, i) => (
            <li key={i} className="list-item">
              <span className={`chip chip-${tag}`}>{tag}</span>
              <span className="skeleton" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
