"use client";

import { useEffect, useState } from "react";
import { ACCOUNT_EVENT, signedIn } from "@/lib/account-sync";
import Embed from "./Embed";
import { useT } from "./I18n";

// My Stats on the account page (/account#my-stats), under the account cards. Signed in, it shows the stats
// dashboard; signed out, a line pointing at the sign-in card above. The games themselves stay on the
// player's computer (the dashboard reads them from the local helper).
export default function MyStatsSection() {
  const t = useT("stats");
  const [inside, setInside] = useState<boolean | null>(null);

  useEffect(() => {
    const update = () => setInside(signedIn());
    update();
    addEventListener(ACCOUNT_EVENT, update);
    return () => removeEventListener(ACCOUNT_EVENT, update);
  }, []);

  // The section appears after the page loads, so a link to #my-stats scrolls once it's there.
  useEffect(() => {
    if (inside !== null && location.hash === "#my-stats") document.getElementById("my-stats")?.scrollIntoView();
  }, [inside]);

  if (inside === null) return null;
  return (
    <section id="my-stats" className="my-stats">
      <h2>{t("My Stats")}</h2>
      {inside ? (
        <>
          <p className="lede">
            {t("Import your games with the button below. You need to be connected to the Riot Client: open it on this computer and sign in first. Your games stay on your computer.")}
          </p>
          <Embed src="/embed/dashboard/index.html" title={t("My Stats")} minHeight={420} />
        </>
      ) : (
        <p className="lede">{t("Sign in above to see your Mayhem games here: win rate, champions, augments and recent matches.")}</p>
      )}
    </section>
  );
}
