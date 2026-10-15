import Link from "next/link";
import SectionIcon from "@/components/SectionIcon";
import { ArrowIcon } from "@/components/icons";
import { sections } from "@/lib/sections";

export default function Home() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow fade-up">Howling Abyss · Mayhem</p>
        <h1 className="hero-title fade-up" style={{ animationDelay: "60ms" }}>
          ARAM <span className="shimmer">Mayhem</span>
        </h1>
        <p className="hero-sub fade-up" style={{ animationDelay: "120ms" }}>
          Stats, damage simulation and PBE changes for the chaos on the bridge.
        </p>
        <div className="hero-actions fade-up" style={{ animationDelay: "180ms" }}>
          <Link href="/stats" className="btn btn-primary">
            Explore stats <ArrowIcon className="btn-arrow" />
          </Link>
          <Link href="/simulator" className="btn btn-ghost">
            Run a simulation
          </Link>
        </div>
      </section>

      <div className="cards">
        {sections.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className="card fade-up"
            data-accent={s.key}
            style={{ animationDelay: `${240 + i * 80}ms` }}
          >
            <div className="hex-badge">
              <SectionIcon section={s.key} className="icon" />
            </div>
            <h2>{s.title}</h2>
            <p className="muted">{s.body}</p>
            <span className="card-cta">
              Open <ArrowIcon className="card-arrow" />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
