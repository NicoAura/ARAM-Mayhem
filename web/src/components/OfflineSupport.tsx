"use client";

import { useEffect } from "react";

// Registers the offline worker (public/sw.js) once the page has loaded, so recently opened pages
// still open without a connection. Production builds only, so local development isn't cached.
export default function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else addEventListener("load", register, { once: true });
  }, []);
  return null;
}
