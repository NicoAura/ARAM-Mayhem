"use client";

import { useSyncExternalStore } from "react";

// The compare tray: up to two champions picked from the Tier List or champion pages, kept in this
// browser's localStorage so the pick survives moving between pages. Adding a third drops the oldest.

const KEY = "deeparam-compare";
const EVENT = "deeparam-compare";
const MAX = 2;
const EMPTY: string[] = [];

let cached: { raw: string | null; list: string[] } = { raw: null, list: EMPTY };
function read(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw === cached.raw) return cached.list;
  let list = EMPTY;
  try {
    const v = JSON.parse(raw || "[]");
    if (Array.isArray(v)) list = v.filter((x): x is string => typeof x === "string").slice(-MAX);
  } catch {}
  cached = { raw, list };
  return list;
}

function subscribe(fn: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  addEventListener(EVENT, fn);
  addEventListener("storage", onStorage);
  return () => {
    removeEventListener(EVENT, fn);
    removeEventListener("storage", onStorage);
  };
}

function write(next: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  dispatchEvent(new Event(EVENT));
}

export function toggleCompare(id: string) {
  const list = read();
  write(list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-MAX));
}

export const clearCompare = () => write([]);

/** Champion ids in the compare tray, oldest first. Empty on the server and before hydration. */
export const useCompare = () => useSyncExternalStore(subscribe, read, () => EMPTY);
