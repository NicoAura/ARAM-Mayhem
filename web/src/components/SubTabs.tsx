"use client";

import { useEffect, useState } from "react";

// In-page tabs. All panels are rendered on the server; this only switches which is visible.
export default function SubTabs({ tabs }: { tabs: { id: string; label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  // ?tab=<id> opens that tab, so links from the home page and search land on the right one.
  useEffect(() => {
    const want = new URLSearchParams(location.search).get("tab");
    if (want && tabs.some((t) => t.id === want)) setActive(want);
  }, [tabs]);
  return (
    <div className="subtabs">
      <div className="subtab-list" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
