"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Old champion links (/champions#Ahri) open that champion's own page (/champions/Ahri);
// a bare /champions goes to the Tier List. Redirects can't see the #part, so this runs in the browser.
export default function ChampionRedirect({ aliases }: { aliases: string[] }) {
  const router = useRouter();
  useEffect(() => {
    const want = decodeURIComponent(location.hash.slice(1)).toLowerCase();
    const alias = aliases.find((a) => a.toLowerCase() === want);
    router.replace(alias ? `/champions/${alias}` : "/tier-list");
  }, [aliases, router]);
  return null;
}
