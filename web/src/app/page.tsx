import Link from "next/link";
import SectionIcon from "@/components/SectionIcon";
import { ArrowIcon } from "@/components/icons";
import { sections } from "@/lib/sections";

export default function Home() {
  return (
    <>
      <section className="hero card enter">
        <p className="label-large">Howling Abyss · Mayhem</p>
        <h1 className="display-large">ARAM Mayhem</h1>
        <p className="body-large">Stats, damage simulation and PBE changes for the chaos on the bridge.</p>
        <div className="hero-actions">
          <Link href="/stats" className="btn filled ripple">
            Explore stats <ArrowIcon className="btn-icon" />
          </Link>
          <Link href="/simulator" className="btn tonal ripple">
            Run a simulation
          </Link>
        </div>
      </section>

      <h2 className="title-large section-heading enter" style={{ animationDelay: "60ms" }}>
        Sections
      </h2>
      <div className="cards">
        {sections.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className="card elevated interactive ripple enter"
            data-accent={s.key}
            style={{ animationDelay: `${100 + i * 60}ms` }}
          >
            <div className="icon-container">
              <SectionIcon section={s.key} className="icon" />
            </div>
            <h3 className="title-large">{s.title}</h3>
            <p className="body-medium on-variant">{s.body}</p>
            <span className="text-btn accent-text">
              Open <ArrowIcon className="btn-icon" />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
