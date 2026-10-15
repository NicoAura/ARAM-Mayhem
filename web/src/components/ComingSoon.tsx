// Shimmering skeleton that hints at the layout a section will have once its data is wired up.
export default function ComingSoon({
  label,
  variant,
}: {
  label: string;
  variant: "table" | "form" | "list";
}) {
  return (
    <section className="coming-soon fade-up" style={{ animationDelay: "120ms" }}>
      <div className="coming-soon-label">
        <span className="pulse-dot" />
        {label}
      </div>
      {variant === "table" && (
        <div className="skeleton-table">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton-row">
              <span className="skeleton avatar" />
              <span className="skeleton" style={{ width: `${40 - i * 3}%` }} />
              <span className="skeleton bar" style={{ width: `${70 - i * 8}%` }} />
              <span className="skeleton short" />
            </div>
          ))}
        </div>
      )}
      {variant === "form" && (
        <div className="skeleton-form">
          <div className="skeleton-fields">
            {["Champion", "Items", "Augments", "Target"].map((f) => (
              <div key={f} className="skeleton-field">
                <span className="field-label">{f}</span>
                <span className="skeleton input" />
              </div>
            ))}
          </div>
          <div className="skeleton-chart">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} className="skeleton column" style={{ height: `${25 + ((i * 37) % 70)}%` }} />
            ))}
          </div>
        </div>
      )}
      {variant === "list" && (
        <div className="skeleton-list">
          {["buff", "nerf", "change", "buff", "nerf"].map((tag, i) => (
            <div key={i} className="skeleton-item">
              <span className={`tag tag-${tag}`}>{tag}</span>
              <span className="skeleton" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
