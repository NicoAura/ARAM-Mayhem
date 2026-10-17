"use client";

import { useState } from "react";
import { useT } from "@/components/I18n";

// A ranked list that shows its first `limit` rows and hides the rest behind a "Show all" button.

export default function ShowMore({
  total,
  limit = 8,
  children,
}: {
  total: number;
  limit?: 5 | 8 | 10;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useT("champions");
  const cut = total > limit && !open;
  return (
    <>
      <div className={cut ? `cp-rows cp-cut-${limit}` : "cp-rows"}>
        {children}
      </div>
      {total > limit && (
        <button
          type="button"
          className="cp-more"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? t("Show fewer") : t("Show all {n}", { n: total })}
        </button>
      )}
    </>
  );
}
