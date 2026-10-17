"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ITEM_TAGS, TAG_GROUPS, itemTag } from "@/lib/item-tags";
import { getParam, setParams } from "@/lib/url-state";

// Items index (/items?tag=crit,as&sort=cost): colour-coded tag filters (every picked tag must match),
// a name search and a sort. Tags come from the shop's categories (lib/item-tags.ts).

type Item = { id: number; slug: string; name: string; icon?: string; cost: number; tags: string[]; popularity: number };
const SORTS = [
  ["popular", "Most built"],
  ["name", "Name"],
  ["cost", "Cost"],
] as const;
type Sort = (typeof SORTS)[number][0];

export default function ItemIndex({ items }: { items: Item[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("popular");

  useEffect(() => {
    setPicked((getParam("tag") ?? "").split(",").filter((t) => itemTag(t)));
    const s = getParam("sort");
    if (SORTS.some(([k]) => k === s)) setSort(s as Sort);
    setQuery(getParam("q") ?? "");
  }, []);

  // Only tags some item has; counts follow the tags already picked.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((i) => picked.every((t) => i.tags.includes(t)) && (!q || i.name.toLowerCase().includes(q)));
    return list.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "cost" ? b.cost - a.cost || a.name.localeCompare(b.name) : b.popularity - a.popularity));
  }, [items, picked, query, sort]);
  const count = (key: string) => shown.filter((i) => i.tags.includes(key)).length;

  const toggle = (key: string) => {
    const next = picked.includes(key) ? picked.filter((t) => t !== key) : [...picked, key];
    setPicked(next);
    setParams({ tag: next.join(",") || null });
  };

  return (
    <div className="items-index">
      <div className="items-filters">
        {TAG_GROUPS.map(([group, label]) => (
          <div key={group} className="items-group" data-group={group} role="group" aria-label={label}>
            <span className="items-group-label">{label}</span>
            {ITEM_TAGS.filter((t) => t.group === group && items.some((i) => i.tags.includes(t.key))).map((t) => (
              <button
                key={t.key}
                type="button"
                className="item-tag"
                data-group={group}
                aria-pressed={picked.includes(t.key)}
                disabled={!picked.includes(t.key) && count(t.key) === 0}
                onClick={() => toggle(t.key)}
              >
                {t.label}
                <small>{picked.includes(t.key) ? "" : count(t.key)}</small>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="items-bar">
        <input
          type="search"
          className="table-search"
          placeholder="Find an item"
          aria-label="Find an item"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setParams({ q: e.target.value.trim() || null });
          }}
        />
        <div className="seg" role="group" aria-label="Sort">
          {SORTS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={sort === k}
              onClick={() => {
                setSort(k);
                setParams({ sort: k === "popular" ? null : k });
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="items-count">
          {shown.length} of {items.length}
        </span>
      </div>
      {shown.length ? (
        <ul className="items-grid">
          {shown.map((i) => (
            <li key={i.id}>
              <Link href={`/items/${i.slug}`} className="item-card">
                {i.icon && <img src={i.icon} alt="" width={48} height={48} loading="lazy" />}
                <span className="item-card-body">
                  <b>{i.name}</b>
                  {i.cost > 0 && <small>{i.cost.toLocaleString("en-US")} gold</small>}
                  <span className="item-card-tags">
                    {i.tags.map((t) => (
                      <span key={t} className="item-dot" data-group={itemTag(t)?.group} title={itemTag(t)?.label} />
                    ))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No item has all of those"
          action={
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPicked([]);
                setQuery("");
                setParams({ tag: null, q: null });
              }}
            >
              Show every item
            </button>
          }
        >
          Remove a tag or clear the search.
        </EmptyState>
      )}
    </div>
  );
}
