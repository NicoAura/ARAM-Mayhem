"use client";

import { useEffect, useState } from "react";
import Embed from "@/components/Embed";
import { useT } from "@/components/I18n";
import { adminFlag } from "@/lib/admin-flag";

const PUBLIC = "/embed/simulator/index.html";
const FULL = "/embed/simulator/full.html";
const VIEW_KEY = "deeparam-sim-view";

// The Fight replays tab. Visitors get the 2D replay. The signed-in site owner gets the 3D replay (models
// and game sounds) by default, with a switch to the public 2D one; the 3D files are served to the owner
// only (src/middleware.ts), so the switch shows only once the server has answered for full.html.
export default function SimReplayEmbed() {
  const t = useT("simulator");
  const [owner, setOwner] = useState(false);
  const [view, setView] = useState<"3d" | "2d">("3d");
  useEffect(() => {
    if (!adminFlag()) return;
    try {
      if (localStorage.getItem(VIEW_KEY) === "2d") setView("2d");
    } catch {
      // Storage blocked: 3D stays the default.
    }
    let live = true;
    fetch(FULL, { method: "HEAD", cache: "no-store" })
      .then((r) => live && r.ok && setOwner(true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const pick = (v: "3d" | "2d") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Storage blocked: the pick lasts until the page closes.
    }
  };
  if (!owner) return <Embed src={PUBLIC} title="Mayhem fight replay" minHeight={900} />;
  return (
    <>
      <div className="seg" role="group" aria-label={t("Replay view")} style={{ marginBottom: 12 }}>
        <button type="button" aria-pressed={view === "3d"} onClick={() => pick("3d")} title={t("3D models and game sounds, only you see this")}>
          3D
        </button>
        <button type="button" aria-pressed={view === "2d"} onClick={() => pick("2d")} title={t("What visitors see")}>
          2D
        </button>
      </div>
      <Embed key={view} src={view === "3d" ? FULL : PUBLIC} title="Mayhem fight replay" minHeight={900} />
    </>
  );
}
