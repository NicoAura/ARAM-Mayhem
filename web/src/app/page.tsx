import Link from "next/link";
import { allTabs } from "@/lib/tabs";

export default function Home() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">ARAM Mayhem</p>
        <h1>Stats, simulation and PBE changes for the chaos on the bridge.</h1>
      </section>
      <ul className="index">
        {allTabs().map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} className="index-row">
              <span className="index-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="index-title">{s.label}</span>
              <span className="index-body">{s.body}</span>
              <span className="index-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
