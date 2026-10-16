"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Shows its page only when the address names something (/champions#Ahri); a bare address
// goes to `fallback` instead. Redirects can't see the #part, so this runs in the browser.
export default function HashOnly({ fallback, children }: { fallback: string; children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const check = () => (location.hash.length > 1 ? setOk(true) : router.replace(fallback));
    check();
    addEventListener("hashchange", check);
    return () => removeEventListener("hashchange", check);
  }, [fallback, router]);
  return ok ? <>{children}</> : null;
}
