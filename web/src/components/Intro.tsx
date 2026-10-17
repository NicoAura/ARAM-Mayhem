export default function Intro({ eyebrow, title, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="intro compact">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {children && <p className="lede">{children}</p>}
    </section>
  );
}
