"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import championIds from "@/data/champion-ids.json";
import { adminFlag } from "@/lib/admin-flag";
import { loadSettings } from "@/lib/settings";
import ddVersion from "@/data/dd-version.json";

// A champion's splash art and abilities, from the official champion data and art (copied to public/assets/
// by scripts/fetch_assets.py). Opens from a champion name in the tier list.

const IDS = championIds as Record<string, number>;
const DD = `/assets/dd/${ddVersion.version}`;

const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

type Ability = { spellKey: string; name: string; icon: string; description: string };
type Champ = { name: string; title: string; splash: string; abilities: Ability[] };
type DdAbility = { name: string; description: string; image: { full: string } };
type DdChampion = { name: string; title: string; passive: DdAbility; spells: DdAbility[] };

export const hasPanel = (alias: string) => alias in IDS;

// Each ability's short preview clip, mirrored in public/assets/clips/ (some champions have none).
const clipSrc = (id: number, key: string) => {
  const k = String(id).padStart(4, "0");
  return `/assets/clips/${k}/ability_${k}_${key.toUpperCase()}1.webm`;
};
// Clips play on hover with a mouse; on touch, with reduced motion or Low graphics they wait for a tap.
const autoplayClips = () =>
  matchMedia("(hover: hover) and (pointer: fine)").matches &&
  document.documentElement.dataset.motion !== "reduce" &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches &&
  loadSettings().graphics !== "low";

export default function ChampionPanel({
  alias,
  onClose,
}: {
  alias: string;
  onClose: () => void;
}) {
  const id = IDS[alias];
  const dialog = useRef<HTMLDialogElement>(null);
  const [champ, setChamp] = useState<Champ | null>(null);
  const [error, setError] = useState("");
  const [clip, setClip] = useState<string | null>(null);
  // Ability videos are admin-only files (src/middleware.ts).
  const [admin, setAdmin] = useState(false);
  useEffect(() => setAdmin(adminFlag()), []);
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const [hoverPlay, setHoverPlay] = useState(false);
  useEffect(() => {
    setHoverPlay(autoplayClips());
  }, []);

  useEffect(() => {
    dialog.current?.showModal();
    let live = true;
    // Seasonal versions (Jade_Ahri) share the base champion's data.
    const key = alias.replace(/^Jade_/, "");
    fetch(`${DD}/data/en_US/champion/${key}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { data: Record<string, DdChampion> }) => {
        const c = Object.values(d.data)[0];
        const ability = (a: DdAbility, spellKey: string, folder: string): Ability => ({ spellKey, name: a.name, description: a.description, icon: `${DD}/img/${folder}/${a.image.full}` });
        if (live)
          setChamp({
            name: c.name,
            title: c.title,
            splash: `/assets/dd/img/champion/splash/${key}_0.jpg`,
            abilities: [ability(c.passive, "passive", "passive"), ...c.spells.map((a, i) => ability(a, "qwer"[i], "spell"))],
          });
      })
      .catch(() => live && setError("Couldn't load this champion."));
    return () => {
      live = false;
    };
  }, [alias]);

  const abilities = champ?.abilities ?? [];

  return (
    <dialog
      ref={dialog}
      className="champ-panel"
      aria-label={champ?.name ?? alias}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
    >
      <div className="champ-panel-inner">
        <div className="champ-splash">
          {champ && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={champ.splash}
              alt=""
            />
          )}
          {clip && !missing.has(clip) && (
            <video
              key={clip}
              className="champ-clip"
              src={clipSrc(id, clip)}
              autoPlay
              loop
              muted
              playsInline
              onError={() => {
                setMissing((m) => new Set(m).add(clip));
                setClip(null);
              }}
            />
          )}
          <button
            type="button"
            className="champ-close"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <div className="champ-splash-text">
            <h2>{champ?.name ?? alias}</h2>
            {champ && <p>{champ.title}</p>}
          </div>
        </div>
        <div className="champ-body">
          {error && <p className="admin-status error">{error}</p>}
          <Link className="inline-link" href={`/champions/${alias}`}>
            Champion page →
          </Link>
          <ul className="champ-abilities">
            {abilities.map((a) => {
              const key = a.spellKey;
              const hasClip = admin && key !== "passive" && !missing.has(key);
              const open = clip === key && hasClip;
              return (
                <li
                  key={a.spellKey}
                  data-clip={hasClip || undefined}
                  onPointerEnter={() => hoverPlay && hasClip && setClip(key)}
                  onPointerLeave={() => hoverPlay && setClip((c) => (c === key ? null : c))}
                  data-playing={open || undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.icon} alt="" width={40} height={40} loading="lazy" />
                  <div>
                    <b>
                      <span className="champ-key">{key === "passive" ? "Passive" : key.toUpperCase()}</span>
                      {a.name}
                      {hasClip && (
                        <button
                          type="button"
                          className="champ-clip-btn"
                          aria-expanded={open}
                          aria-label={open ? `Hide ${a.name} clip` : `Play ${a.name} clip`}
                          onClick={() => setClip(open ? null : key)}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                            {open ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
                          </svg>
                        </button>
                      )}
                    </b>
                    <p>{plain(a.description)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </dialog>
  );
}
