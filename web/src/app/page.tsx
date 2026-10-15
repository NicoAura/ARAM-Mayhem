import Link from "next/link";

const sections = [
  { href: "/stats", title: "Stats", body: "Win rates, augments and builds from ARAM Mayhem matches." },
  { href: "/simulator", title: "Simulator", body: "Estimate a champion's damage against a target with a given build." },
  { href: "/pbe", title: "PBE", body: "Upcoming Mayhem changes on the test server." },
];

export default function Home() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">ARAM Mayhem</p>
        <h1>Stats, simulation and PBE changes for the chaos on the bridge.</h1>
      </section>
      <ul className="index">
        {sections.map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} className="index-row">
              <span className="index-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="index-title">{s.title}</span>
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
