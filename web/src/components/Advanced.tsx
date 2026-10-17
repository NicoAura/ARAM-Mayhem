"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { loadSettings } from "@/lib/settings";

// Standard / Advanced switch for the tier list. Advanced shows every stat the data has;
// tables read it through useAdvanced() and swap in their advanced columns.

const Ctx = createContext<{ advanced: boolean; setAdvanced: (v: boolean) => void }>({ advanced: false, setAdvanced: () => {} });

export const useAdvanced = () => useContext(Ctx).advanced;

// Remembered in this browser with the rest of the page's view (Settings > Remember my views).
const KEY = "deeparam-view-advanced";

export function AdvancedProvider({ children }: { children: React.ReactNode }) {
  const [advanced, setState] = useState(false);
  useEffect(() => {
    try {
      if (loadSettings().remember && localStorage.getItem(KEY) === "1") setState(true);
    } catch {}
  }, []);
  const setAdvanced = (v: boolean) => {
    setState(v);
    try {
      if (loadSettings().remember) localStorage.setItem(KEY, v ? "1" : "0");
    } catch {}
  };
  return <Ctx.Provider value={{ advanced, setAdvanced }}>{children}</Ctx.Provider>;
}

export function AdvancedToggle() {
  const { advanced, setAdvanced } = useContext(Ctx);
  return (
    <div className="view-toggle" role="group" aria-label="View">
      <button type="button" aria-pressed={!advanced} onClick={() => setAdvanced(false)}>
        Standard
      </button>
      <button type="button" aria-pressed={advanced} onClick={() => setAdvanced(true)}>
        Advanced
      </button>
    </div>
  );
}
