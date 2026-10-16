import type { Metadata } from "next";
import AugmentCard from "@/components/AugmentCard";
import Intro from "@/components/Intro";
import Pending from "@/components/Pending";
import { readRepoJson } from "@/lib/repo-data";

export const metadata: Metadata = { title: "PBE · DeepARAM" };

type Change = { stat: string; live: string; pbe: string };
type Pbe = {
  meta: {
    label: string;
    codename: string;
    dataAsOf: string;
    caveat: string;
    builds: { pbe: string; live: string };
    augmentPool: { live: number; pbe: number };
    notes: string[];
  };
  headliners: { summary: string; list: { name: string; effect: string }[] };
  fame: {
    summary: string;
    bands: { name: string; unlockFame: number; members: string[]; sampleObjectives: string[] }[];
  };
  augments: {
    added: { name: string | null; tier: string; set?: string; description: string | null; icon?: string }[];
    removed: { name: string; tier: string; icon?: string }[];
    changed: { name: string; tier?: string; direction?: string; changes: Change[]; icon?: string }[];
  };
  championOverrides: { champion: string; ability: string; live: string; pbe: string; note?: string }[];
  championChanges: { summary: string; list: { champion: string; changes: string[] }[] };
  itemChanges: { summary: string; list: { item: string; changes: string[] }[]; outsideMayhemShop?: string[] };
  modeChanges: string[];
};

const TIERS = ["prismatic", "gold", "silver"];

function Section({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="doc-section" id={id}>
      <h2>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

export default function PbePage() {
  const d = readRepoJson<Pbe>("data/pbe/kiwi-s3.json");
  if (!d) {
    return (
      <>
        <Intro eyebrow="PBE" title="Mayhem changes on the test server." />
        <Pending pr={1}>The PBE datamine appears here once it is merged:</Pending>
      </>
    );
  }

  const { meta, augments } = d;
  const toc = [
    ["headliners", "Headliners"],
    ["fame", "Fame"],
    ["augments", "Augments"],
    ["overrides", "Mayhem overrides"],
    ["champions", "Champions"],
    ["items", "Items"],
    ["mode", "Mode"],
  ];

  return (
    <>
      <Intro eyebrow={`PBE · ${meta.label}`} title={`Mayhem ${meta.label} (${meta.codename}) on the test server.`}>
        PBE {meta.builds.pbe} compared with live {meta.builds.live}, datamined {meta.dataAsOf}. Augment pool{" "}
        {meta.augmentPool.live} → {meta.augmentPool.pbe}. {meta.caveat}
      </Intro>

      <nav className="toc" aria-label="On this page">
        {toc.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <Section id="headliners" title="Headliners" count={d.headliners.list.length}>
        <p className="lede">{d.headliners.summary}</p>
        <dl className="defs">
          {d.headliners.list.map((h) => (
            <div key={h.name}>
              <dt>{h.name}</dt>
              <dd>{h.effect}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="fame" title="Fame" count={d.fame.bands.length}>
        <p className="lede">{d.fame.summary}</p>
        <dl className="defs">
          {d.fame.bands.map((b) => (
            <div key={b.name}>
              <dt>
                {b.name}
                <span className="sub">{b.unlockFame ? `${b.unlockFame.toLocaleString()} Fame` : "Starts unlocked"}</span>
              </dt>
              <dd>
                {b.members.join(", ")}
                <span className="sub">Objectives: {b.sampleObjectives.join(" · ")}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="augments" title="Augments" count={augments.added.length + augments.removed.length + augments.changed.length}>
        <h3>Added ({augments.added.length})</h3>
        <div className="aug-grid">
          {TIERS.flatMap((tier) =>
            augments.added
              .filter((a) => a.tier === tier)
              .map((a, i) => (
                <AugmentCard key={`${a.name}-${i}`} name={a.name ?? "Unnamed"} tier={tier} icon={a.icon} set={a.set}>
                  {a.description ?? "No tooltip summary yet."}
                </AugmentCard>
              )),
          )}
        </div>
        <h3>Changed ({augments.changed.length})</h3>
        <div className="aug-grid">
          {augments.changed.map((a) => (
            <AugmentCard key={a.name} name={a.name} tier={a.tier} icon={a.icon}>
              {a.direction && <span className={`tag tag-${a.direction}`}>{a.direction}</span>}
              {a.changes.map((c) => (
                <span key={c.stat} className="change">
                  {c.stat}: <s>{c.live}</s> → <b>{c.pbe}</b>
                </span>
              ))}
            </AugmentCard>
          ))}
        </div>
        <h3>Removed ({augments.removed.length})</h3>
        <div className="aug-grid aug-mini">
          {augments.removed.map((a) => (
            <AugmentCard key={a.name} name={a.name} tier={a.tier} icon={a.icon} removed compact />
          ))}
        </div>
      </Section>

      <Section id="overrides" title="Mayhem overrides" count={d.championOverrides.length}>
        <dl className="defs">
          {d.championOverrides.map((o) => (
            <div key={`${o.champion}-${o.ability}`}>
              <dt>
                {o.champion} {o.ability}
              </dt>
              <dd>
                <span className="change">
                  <s>{o.live}</s> → <b>{o.pbe}</b>
                </span>
                {o.note && <span className="sub">{o.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="champions" title="Champion changes" count={d.championChanges.list.length}>
        <p className="lede">{d.championChanges.summary}</p>
        <dl className="defs">
          {d.championChanges.list.map((c) => (
            <div key={c.champion}>
              <dt>{c.champion}</dt>
              <dd>
                {c.changes.map((x) => (
                  <span key={x} className="change">
                    {x}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="items" title="Item changes" count={d.itemChanges.list.length}>
        <p className="lede">{d.itemChanges.summary}</p>
        <dl className="defs">
          {d.itemChanges.list.map((c) => (
            <div key={c.item}>
              <dt>{c.item}</dt>
              <dd>
                {c.changes.map((x) => (
                  <span key={x} className="change">
                    {x}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        {d.itemChanges.outsideMayhemShop?.length ? (
          <p className="sub">Not in the Mayhem shop: {d.itemChanges.outsideMayhemShop.join("; ")}</p>
        ) : null}
      </Section>

      <Section id="mode" title="Mode changes" count={d.modeChanges.length}>
        <ul className="bullets">
          {d.modeChanges.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <h3>Notes on this data</h3>
        <ul className="bullets sub">
          {meta.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
