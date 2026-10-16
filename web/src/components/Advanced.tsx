"use client";

import { createContext, useContext, useState } from "react";

// Standard / Advanced switch for the tier list. Advanced shows every stat the data has;
// tables read it through useAdvanced() and swap in their advanced columns.

const Ctx = createContext<{ advanced: boolean; setAdvanced: (v: boolean) => void }>({ advanced: false, setAdvanced: () => {} });

export const useAdvanced = () => useContext(Ctx).advanced;

export function AdvancedProvider({ children }: { children: React.ReactNode }) {
  const [advanced, setAdvanced] = useState(false);
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
