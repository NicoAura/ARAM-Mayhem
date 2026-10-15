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
    <header className="page-header enter" data-accent={section}>
      <div className="icon-container large">
        <SectionIcon section={section} className="icon" />
      </div>
      <div>
        <p className="label-medium accent-text">{eyebrow}</p>
        <h1 className="headline-large">{title}</h1>
        <p className="body-large on-variant">{children}</p>
      </div>
    </header>
  );
}
