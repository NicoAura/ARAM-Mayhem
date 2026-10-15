import type { SectionKey } from "@/lib/sections";
import SectionIcon from "./SectionIcon";

export default function PageHeader({
  section,
  eyebrow,
  title,
  children,
}: {
  section: SectionKey;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <header className="page-header fade-up" data-accent={section}>
      <div className="hex-badge">
        <SectionIcon section={section} className="icon" />
      </div>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <p className="muted">{children}</p>
      </div>
    </header>
  );
}
