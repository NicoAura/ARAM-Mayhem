"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import type { BuilderData } from "@/lib/builder";
import { getParam, setParams } from "@/lib/url-state";
import Skeleton from "@/components/Skeleton";
import ShareCard from "@/components/ShareCard";
import type { CardSpec } from "@/lib/share-card";
import { buzz } from "@/lib/haptics";
import { LoadError } from "@/components/EmptyState";

// Build Editor (/builder?champ=Jinx&items=…&augs=…): drag items into six slots and pick four augments;
// the summed stats and gold update as you go and the simulator re-runs the build in the browser
// (the Simulator's own engine, /embed/simulator/sim-worker.js) for its damage per second.

type SimItem = { key: string; name: string; slot: string; rarity: string; roles: string[] };
type SimChamp = { id: string; name: string; role: string; augments: string[] };
type SimList = { champions: SimChamp[]; items: SimItem[]; augments: SimItem[] };
type Summary = { mean_dps: number; ci95: number; time_alive: number; survival_rate: number; share_by_source: Record<string, number> };
type Best = { champion: string; build: { items: string[]; augments: string[] } };

const SLOTS = 6;
const AUGS = 4;
const ROLES: [string, string][] = [
  ["", "All"],
  ["ad", "AD"],
  ["crit", "Crit"],
  ["onhit", "On-hit"],
  ["lethality", "Lethality"],
  ["ability_ad", "Ability AD"],
  ["ap", "AP"],
  ["ap_onhit", "AP on-hit"],
  ["bruiser", "Bruiser"],
  ["tank", "Tank"],
  ["ap_tank", "AP tank"],
  ["boots", "Boots"],
];
const RARITY = ["prismatic", "gold", "silver"];

// One worker for the page; each call gets its own id so replies can't cross.
let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: { ok: boolean; stdout: string; stderr: string }) => void>();
function sim(args: string[]) {
  if (!worker) {
    worker = new Worker("/embed/simulator/sim-worker.js");
    worker.onmessage = (e) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
  }
  const id = ++seq;
  return new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
    waiting.set(id, resolve);
    worker!.postMessage({ id, args });
  });
}

const fixed = (n: number, d = 0) => n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

export default function BuildEditor() {
  const [list, setList] = useState<SimList | null>(null);
  const [data, setData] = useState<BuilderData | null>(null);
  const [best, setBest] = useState<Best[]>([]);
  const [failed, setFailed] = useState(false);
  const [champ, setChamp] = useState("");
  const [items, setItems] = useState<(string | null)[]>(Array(SLOTS).fill(null));
  const [augs, setAugs] = useState<string[]>(Array(AUGS).fill(""));
  const [level, setLevel] = useState(18);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [result, setResult] = useState<Summary | null>(null);
  const [prev, setPrev] = useState<Summary | null>(null);
  const [running, setRunning] = useState(false);
  const [simError, setSimError] = useState("");
  const [over, setOver] = useState<number | null>(null);
  const drag = useRef<{ key: string; from: number | null } | null>(null);
  const last = useRef<Summary | null>(null);

  useEffect(() => {
    Promise.all([
      sim(["--list", "--json"]).then((r) => (r.ok ? (JSON.parse(r.stdout) as SimList) : Promise.reject(r.stderr))),
      fetch("/data/builder.json").then((r) => (r.ok ? (r.json() as Promise<BuilderData>) : Promise.reject(r.status))),
      fetch("/embed/simulator/replay-data/best-builds.json")
        .then((r) => (r.ok ? r.json() : { champions: [] }))
        .catch(() => ({ champions: [] })),
    ])
      .then(([l, d, b]) => {
        const bests = (b.champions ?? []) as Best[];
        const want = (getParam("champ") ?? "Jinx").toLowerCase();
        const c = l.champions.find((x) => x.id.toLowerCase() === want) ?? l.champions.find((x) => x.id === "Jinx") ?? l.champions[0];
        const keys = new Set(l.items.map((i) => i.key));
        const fromUrl = (getParam("items") ?? "").split(",").filter((k) => keys.has(k));
        const augUrl = (getParam("augs") ?? "").split(",").filter((k) => c.augments.includes(k));
        const start = fromUrl.length || augUrl.length ? { items: fromUrl, augments: augUrl } : bests.find((x) => x.champion === c.id)?.build;
        setList(l);
        setData(d);
        setBest(bests);
        setChamp(c.id);
        setItems(pad(start?.items ?? [], SLOTS, null));
        setAugs(pad(start?.augments ?? [], AUGS, ""));
      })
      .catch(() => setFailed(true));
  }, []);

  const itemByKey = useMemo(() => new Map(list?.items.map((i) => [i.key, i]) ?? []), [list]);
  const augByKey = useMemo(() => new Map(list?.augments.map((a) => [a.key, a]) ?? []), [list]);
  const champion = list?.champions.find((c) => c.id === champ);
  const champName = (id: string) => data?.champions[id] ?? Object.entries(data?.champions ?? {}).find(([k]) => k.toLowerCase() === id.toLowerCase())?.[1] ?? id;
  const alias = (id: string) => Object.keys(data?.champions ?? {}).find((k) => k.toLowerCase() === id.toLowerCase()) ?? id;
  const champIcon = (id: string) => `/icons/champions/${alias(id)}.webp`;

  // Keep the URL shareable and re-run the simulator a moment after the build stops changing.
  useEffect(() => {
    if (!list || !champ) return;
    const its = items.filter((i): i is string => Boolean(i));
    const as = augs.filter(Boolean);
    setParams({ champ, items: its.length ? its.join(",") : null, augs: as.length ? as.join(",") : null });
    let live = true;
    const t = setTimeout(() => {
      setRunning(true);
      const args = ["--champ", champ, "--json", "--set", `level=${level}`];
      if (its.length) args.push("--items", its.join(","));
      if (as.length) args.push("--augs", as.join(","));
      sim(args).then((r) => {
        if (!live) return;
        setRunning(false);
        try {
          const s = (JSON.parse(r.stdout).builds?.[0]?.summary ?? null) as Summary | null;
          if (!r.ok || !s) throw new Error();
          setSimError("");
          setPrev(last.current);
          last.current = s;
          setResult(s);
        } catch {
          setSimError("The simulator couldn't run this build.");
        }
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [list, champ, items, augs, level]);

  const boots = (key: string) => itemByKey.get(key)?.slot === "boots";
  // Put an item in a slot (or the first free one). One pair of boots, no duplicates.
  const place = (key: string, at: number | null, from: number | null = null) => {
    buzz();
    setItems((cur) => {
      const next = [...cur];
      if (from !== null) {
        const target = at ?? from;
        [next[from], next[target]] = [next[target], next[from]];
        return next;
      }
      if (next.includes(key)) return cur;
      if (boots(key)) {
        const b = next.findIndex((k) => k && boots(k));
        if (b >= 0) {
          next[b] = key;
          return next;
        }
      }
      const slot = at ?? next.indexOf(null);
      if (slot < 0) return cur;
      next[slot] = key;
      return next;
    });
  };
  // Firefox only starts a drag that carries data.
  const start = (e: DragEvent, key: string, from: number | null) => {
    drag.current = { key, from };
    e.dataTransfer.setData("text/plain", key);
    e.dataTransfer.effectAllowed = "move";
  };
  const remove = (i: number) => setItems((cur) => cur.map((k, n) => (n === i ? null : k)));

  const pickChamp = (id: string) => {
    setChamp(id);
    setPrev(null);
    setResult(null);
    last.current = null;
    const b = best.find((x) => x.champion === id)?.build;
    setItems(pad(b?.items ?? [], SLOTS, null));
    setAugs(pad(b?.augments ?? [], AUGS, ""));
  };
  const reset = () => {
    const b = best.find((x) => x.champion === champ)?.build;
    setItems(pad(b?.items ?? [], SLOTS, null));
    setAugs(pad(b?.augments ?? [], AUGS, ""));
  };

  const picked = items.filter((k): k is string => Boolean(k));
  const totals = useMemo(() => {
    const sum = new Map<string, [number, boolean]>();
    let gold = 0;
    for (const k of picked) {
      const d = data?.items[itemByKey.get(k)?.name ?? ""];
      if (!d) continue;
      gold += d.price;
      for (const [v, pct, label] of d.stats) sum.set(label, [(sum.get(label)?.[0] ?? 0) + v, pct]);
    }
    return { gold, stats: [...sum.entries()] };
  }, [picked, data, itemByKey]);

  const shareSpec = useMemo<CardSpec | null>(() => {
    if (!result || !data || !list) return null;
    const icon = (k: string) => data.items[list.items.find((i) => i.key === k)?.name ?? ""]?.icon;
    return {
      title: `${champName(champ)} build`,
      subtitle: `Simulated at level ${level} · ${totals.gold.toLocaleString("en-US")} gold`,
      icon: champIcon(champ),
      stats: [
        { label: "Damage per second", value: fixed(result.mean_dps) },
        { label: "Time alive", value: `${fixed(result.time_alive, 1)} s` },
      ],
      row: { label: "Items", icons: picked.map(icon).filter((x): x is string => Boolean(x)) },
      url: typeof location === "undefined" ? "https://deeparam.com/builder" : `https://deeparam.com/builder${location.search}`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- champName/champIcon only read data
  }, [result, data, list, champ, level, totals.gold, items]);

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list?.items ?? [])
      .filter((i) => !role || (role === "boots" ? i.slot === "boots" : i.roles.includes(role)))
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [list, query, role]);

  if (failed) return <LoadError what="The Build Editor" />;
  if (!list || !data || !champion) return <Skeleton kind="slots" rows={6} label="Loading the simulator…" />;

  const icon = (k: string) => data.items[itemByKey.get(k)?.name ?? ""]?.icon;
  const augIcon = (k: string) => {
    const id = data.augments[augByKey.get(k)?.name ?? ""];
    return id ? `/icons/augments/${id}.webp` : undefined;
  };
  const delta = result && prev ? result.mean_dps - prev.mean_dps : 0;
  const pool4 = RARITY.map((r) => [r, champion.augments.map((k) => augByKey.get(k)).filter((a): a is SimItem => a?.rarity === r)] as const);

  return (
    <div className="builder">
      <div className="builder-top">
        <label className="builder-champ">
          <img src={champIcon(champ)} alt="" width={40} height={40} />
          <select value={champ} aria-label="Champion" onChange={(e) => pickChamp(e.target.value)}>
            {[...list.champions]
              .sort((a, b) => champName(a.id).localeCompare(champName(b.id)))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {champName(c.id)}
                </option>
              ))}
          </select>
        </label>
        <label className="builder-level">
          Level <b>{level}</b>
          <input type="range" min={1} max={18} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
        </label>
        <div className="builder-actions">
          <button type="button" className="btn ghost" onClick={reset}>
            Simulated best build
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setItems(Array(SLOTS).fill(null));
              setAugs(Array(AUGS).fill(""));
            }}
          >
            Clear
          </button>
          {shareSpec && <ShareCard spec={shareSpec} />}
          <Link className="inline-link" href={`/champions/${alias(champ)}`}>
            {champName(champ)} page →
          </Link>
        </div>
      </div>

      <div className="builder-grid">
        <section className="card builder-build" data-accent="gold">
          <div className="card-head">
            <h2>Build</h2>
            <span className="card-note">
              <b>{fixed(totals.gold)}</b> gold
            </span>
          </div>
          <ol className="builder-slots" aria-label="Item slots">
            {items.map((k, i) => (
              <li
                key={i}
                className={`builder-slot${k ? " filled" : ""}${over === i ? " over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(i);
                }}
                onDragLeave={() => setOver((o) => (o === i ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const d = drag.current;
                  if (d) place(d.key, i, d.from);
                  drag.current = null;
                }}
              >
                {k ? (
                  <button
                    type="button"
                    draggable
                    title={`${itemByKey.get(k)?.name} (tap to remove)`}
                    aria-label={`Remove ${itemByKey.get(k)?.name}`}
                    onDragStart={(e) => start(e, k, i)}
                    onClick={() => remove(i)}
                  >
                    {icon(k) ? <img src={icon(k)} alt="" width={56} height={56} draggable={false} /> : <span>{itemByKey.get(k)?.name}</span>}
                  </button>
                ) : (
                  <span className="builder-empty" aria-hidden="true">
                    {i + 1}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="builder-names">{picked.map((k) => itemByKey.get(k)?.name).join(" · ") || "Drag items here, or tap one below."}</p>
          <div className="builder-augs">
            {augs.map((a, i) => (
              <label key={i} className="builder-aug" data-rarity={augByKey.get(a)?.rarity}>
                {a && augIcon(a) ? <img src={augIcon(a)} alt="" width={32} height={32} /> : <span className="builder-aug-dot" aria-hidden="true" />}
                <select
                  value={a}
                  aria-label={`Augment ${i + 1}`}
                  onChange={(e) => setAugs((cur) => cur.map((x, n) => (n === i ? e.target.value : x)))}
                >
                  <option value="">Augment {i + 1}</option>
                  {pool4.map(([r, as]) => (
                    <optgroup key={r} label={r[0].toUpperCase() + r.slice(1)}>
                      {as
                        .filter((x) => x.key === a || !augs.includes(x.key))
                        .sort((x, y) => x.name.localeCompare(y.name))
                        .map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="card builder-result" data-accent="tier" aria-live="polite">
          <div className="card-head">
            <h2>Simulated damage</h2>
            <span className="card-note">{running ? "Simulating…" : `level ${level}`}</span>
          </div>
          {simError ? (
            <p className="table-note">{simError}</p>
          ) : result ? (
            <>
              <div className="builder-dps">
                <b>{fixed(result.mean_dps)}</b>
                <span>
                  damage per second ± {fixed(result.ci95)}
                  {prev && Math.abs(delta) >= 0.5 && (
                    <em className={delta > 0 ? "wr-high" : "wr-low"}>
                      {" "}
                      {delta > 0 ? "+" : "−"}
                      {fixed(Math.abs(delta))} vs last
                    </em>
                  )}
                </span>
              </div>
              <dl className="builder-facts">
                <div>
                  <dt>Time alive</dt>
                  <dd>{fixed(result.time_alive, 1)} s</dd>
                </div>
                <div>
                  <dt>Survives the fight</dt>
                  <dd>{fixed(result.survival_rate * 100, 1)}%</dd>
                </div>
              </dl>
              <ul className="builder-share">
                {Object.entries(result.share_by_source)
                  .filter(([, v]) => v > 0.001)
                  .sort((a, b) => b[1] - a[1])
                  .map(([src, v]) => (
                    <li key={src}>
                      <span>{src}</span>
                      <span className="builder-bar">
                        <i style={{ width: `${v * 100}%` }} />
                      </span>
                      <b>{fixed(v * 100)}%</b>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="table-note">Simulating…</p>
          )}
        </section>

        <section className="card builder-stats">
          <div className="card-head">
            <h2>Item stats</h2>
          </div>
          {totals.stats.length ? (
            <dl className="builder-statlist">
              {totals.stats.map(([label, [v, pct]]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {fixed(v)}
                    {pct ? "%" : ""}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="table-note">No items yet.</p>
          )}
        </section>
      </div>

      <section className="card builder-pool">
        <div className="card-head">
          <h2>Items</h2>
          <input className="builder-search" type="search" placeholder="Search items" aria-label="Search items" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="builder-roles" role="group" aria-label="Item type">
          {ROLES.map(([r, label]) => (
            <button key={r} type="button" className="builder-role" aria-pressed={role === r} onClick={() => setRole(r)}>
              {label}
            </button>
          ))}
        </div>
        <ul
          className="builder-items"
          onDragOver={(e) => drag.current?.from !== null && drag.current?.from !== undefined && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (drag.current?.from !== null && drag.current?.from !== undefined) remove(drag.current.from);
            drag.current = null;
          }}
        >
          {pool.map((i) => {
            const used = picked.includes(i.key);
            return (
              <li key={i.key}>
                <button
                  type="button"
                  draggable={!used}
                  disabled={used}
                  title={i.name}
                  onDragStart={(e) => start(e, i.key, null)}
                  onClick={() => place(i.key, null)}
                >
                  {icon(i.key) ? <img src={icon(i.key)} alt="" width={44} height={44} loading="lazy" draggable={false} /> : null}
                  <span>{i.name}</span>
                </button>
              </li>
            );
          })}
          {pool.length === 0 && <li className="table-note">No items match.</li>}
        </ul>
      </section>
      <p className="patch-note">
        Damage is the simulator&apos;s average over many simulated teamfights against a typical enemy team, live patch. Drag an item back to the list
        to remove it.
      </p>
    </div>
  );
}

function pad<T>(xs: T[], n: number, fill: T): T[] {
  return [...xs.slice(0, n), ...Array(Math.max(0, n - xs.length)).fill(fill)];
}
