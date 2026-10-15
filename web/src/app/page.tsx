import Link from "next/link";

const sections = [
  {
    href: "/stats",
    title: "Stats",
    body: "Win rates, augments and builds from ARAM Mayhem matches.",
  },
  {
    href: "/simulator",
    title: "Simulator",
    body: "Estimate a champion's damage against a target with a given build.",
  },
  {
    href: "/pbe",
    title: "PBE",
    body: "Upcoming Mayhem changes on the test server.",
  },
];

export default function Home() {
  return (
    <>
      <h1>ARAM Mayhem</h1>
      <p className="muted">Stats, damage simulation and PBE changes for ARAM Mayhem.</p>
      <div className="cards">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="card">
            <h2>{s.title}</h2>
            <p className="muted">{s.body}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
