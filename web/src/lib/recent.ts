"use client";

import { useEffect, useState } from "react";

// Recently viewed champion, augment, item and patch pages, newest first, kept in this browser
// (localStorage "deeparam-recent"). RecentTracker records visits; RecentStrip shows them on Home.

export type Recent = { href: string; title: string; icon?: string; kind: string };
const KEY = "deeparam-recent";
const EVENT = "deeparam-recent";
const MAX = 12;
export const RECENT_PAGES = /^\/(champions|augments|items|patches)\/[^/]+$/;

export function loadRecent(): Recent[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((r) => r && typeof r.href === "string" && RECENT_PAGES.test(r.href)) : [];
  } catch {
    return [];
  }
}

export function addRecent(r: Recent) {
  const next = [r, ...loadRecent().filter((x) => x.href !== r.href)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  dispatchEvent(new Event(EVENT));
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  dispatchEvent(new Event(EVENT));
}

export function useRecent() {
  const [list, setList] = useState<Recent[]>([]);
  useEffect(() => {
    const sync = () => setList(loadRecent());
    sync();
    addEventListener(EVENT, sync);
    addEventListener("storage", sync);
    return () => {
      removeEventListener(EVENT, sync);
      removeEventListener("storage", sync);
    };
  }, []);
  return list;
}
