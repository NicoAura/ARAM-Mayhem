"use client";

import { useEffect, useState } from "react";
import Embed from "@/components/Embed";
import { useT } from "@/components/I18n";
import { adminFlag } from "@/lib/admin-flag";

const PUBLIC = "/embed/simulator/index.html";
const FULL = "/embed/simulator/full.html";
const VIEW_KEY = "deeparam-sim-view";
const VIEW_EVENT = "deeparam-sim-view";
type View = "3d" | "2d";

// Visitors get the 2D replay. The signed-in site owner gets the 3D replay (models and game sounds) by
// default, with a switch at the top of the page back to the public 2D one. The 3D files are served to the
// owner only (src/middleware.ts), so the switch shows only once the server has answered for full.html.
function useOwnerView(): [boolean, View, (v: View) => void] {
  const [owner, setOwner] = useState(false);
  const [view, setView] = useState<View>("3d");
  useEffect(() => {
    if (!adminFlag()) return;
    try {
      if (localStorage.getItem(VIEW_KEY) === "2d") setView("2d");
    } catch {
      // Storage blocked: 3D stays the default.
    }
    const changed = (e: Event) => setView((e as CustomEvent<View>).detail);
    window.addEventListener(VIEW_EVENT, changed);
    let live = true;
    fetch(FULL, { method: "HEAD", cache: "no-store" })
      .then((r) => live && r.ok && setOwner(true))
      .catch(() => {});
    return () => {
      live = false;
      window.removeEventListener(VIEW_EVENT, changed);
    };
  }, []);
  const pick = (v: View) => {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Storage blocked: the pick lasts until the page closes.
    }
    window.dispatchEvent(new CustomEvent(VIEW_EVENT, { detail: v }));
  };
  return [owner, view, pick];
}

/** The owner's 3D Simulator switch, at the top of the Simulator page; nothing for anyone else. */
export function SimViewSwitch() {
  const t = useT("simulator");
  const [owner, view, pick] = useOwnerView();
  if (!owner) return null;
  return (
    <div className="sim-view-switch">
      <b>{t("3D Simulator")}</b>
      <div className="seg" role="group" aria-label={t("Replay view")}>
        <button type="button" aria-pressed={view === "3d"} onClick={() => pick("3d")} title={t("3D models and game sounds, only you see this")}>
          3D
        </button>
        <button type="button" aria-pressed={view === "2d"} onClick={() => pick("2d")} title={t("What visitors see")}>
          2D
        </button>
      </div>
      <span>{t("Only you see this. Visitors get 2D.")}</span>
    </div>
  );
}

/** The Fight replays tab: 2D for visitors, the owner's pick for the owner. */
export default function SimReplayEmbed() {
  const [owner, view] = useOwnerView();
  const src = owner && view === "3d" ? FULL : PUBLIC;
  return <Embed key={src} src={src} title="Mayhem fight replay" minHeight={900} />;
}
