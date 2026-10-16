import type { MetadataRoute } from "next";
import { navPages } from "@/lib/tabs";

const SITE = "https://deeparam.com";

// Every page in the header, plus Home and My Stats. Rebuilt with each deploy.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages = ["/", ...navPages().map((t) => t.href), "/stats", "/privacy", "/terms"];
  return [...new Set(pages)].map((path) => ({
    url: SITE + (path === "/" ? "" : path),
    lastModified: now,
    changeFrequency: "daily",
    priority: path === "/" ? 1 : path === "/tier-list" ? 0.9 : 0.6,
  }));
}
