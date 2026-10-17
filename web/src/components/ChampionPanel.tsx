"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import championIds from "@/data/champion-ids.json";
import { adminFlag } from "@/lib/admin-flag";
import { loadSettings } from "@/lib/settings";

// A champion's splash art, pick quote and abilities, straight from the League client's files
// (CommunityDragon's extract of each patch, copied to public/assets/). Opens from a champion name in the tier list.

const GAME_DATA = "/assets/cd/latest/plugins/rcp-be-lol-game-data/global/default";
const IDS = championIds as Record<string, number>;

// Client paths look like /lol-game-data/assets/ASSETS/Characters/...; CommunityDragon serves them lowercased.
const asset = (p?: string) =>
  p
    ? `${GAME_DATA}/${p.replace(/^\/lol-game-data\/assets\//, "").toLowerCase().replace(/k[i]wi/g, "mayhem")}`
    : "";
const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

type Ability = {
  spellKey?: string;
  name: string;
  abilityIconPath: string;
  description: string;
};
type Champ = {
  name: string;
  title: string;
  skins: { splashPath: string; uncenteredSplashPath?: string }[];
  passive: Ability;
  spells: Ability[];
};

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
  const audio = useRef<HTMLAudioElement>(null);
  const [champ, setChamp] = useState<Champ | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(true);
  const [clip, setClip] = useState<string | null>(null);
  // Ability videos are admin-only files (src/middleware.ts).
  const [admin, setAdmin] = useState(false);
  useEffect(() => setAdmin(adminFlag()), []);
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const [hoverPlay, setHoverPlay] = useState(false);
  useEffect(() => {
    setSound(loadSettings().sound);
    setHoverPlay(autoplayClips());
  }, []);

  useEffect(() => {
    dialog.current?.showModal();
    let live = true;
    fetch(`${GAME_DATA}/v1/champions/${id}.json`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((c: Champ) => live && setChamp(c))
      .catch(() => live && setError("Couldn't load this champion."));
    return () => {
      live = false;
    };
  }, [id]);

  const play = () => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() =>
      setError("This browser can't play the pick quote (Ogg audio)."),
    );
  };

  const skin = champ?.skins[0];
  const abilities = champ
    ? [{ ...champ.passive, spellKey: "passive" }, ...champ.spells]
    : [];

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
          {skin && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset(skin.uncenteredSplashPath || skin.splashPath)}
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
          {sound && (
            <button
              type="button"
              className="btn ghost champ-quote"
              onClick={play}
              disabled={!champ}
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
                aria-hidden="true"
              >
                {playing ? (
                  <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                ) : (
                  <path d="M8 5v14l11-7z" />
                )}
              </svg>
              Pick quote
            </button>
          )}
          <audio
            ref={audio}
            src={`${GAME_DATA}/v1/champion-choose-vo/${id}.ogg`}
            preload="none"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
          {error && <p className="admin-status error">{error}</p>}
          <Link className="inline-link" href={`/champions/${alias}`}>
            Champion page →
          </Link>
          <ul className="champ-abilities">
            {abilities.map((a) => {
              const key = a.spellKey ?? "";
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
                  <img src={asset(a.abilityIconPath)} alt="" width={40} height={40} loading="lazy" />
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
