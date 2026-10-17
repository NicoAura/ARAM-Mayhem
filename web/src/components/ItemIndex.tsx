"use client";
/* eslint-disable @next/next/no-img-element -- small local icons */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ITEM_TAGS, TAG_GROUPS, itemTag } from "@/lib/item-tags";
import { getParam, setParams } from "@/lib/url-state";
import { useLang, useNames, useT } from "./I18n";

// Items index (/items?tag=crit,as&sort=cost): colour-coded tag filters (every picked tag must match),
// a name search and a sort. Tags come from the shop's categories (lib/item-tags.ts).

type Item = {
  id: number;
  slug: string;
  name: string;
  icon?: string;
  cost: number;
  tags: string[];
  popularity: number;
};
const SORTS = [
  ["popular", "Most built"],
  ["name", "Name"],
  ["cost", "Cost"],
] as const;
type Sort = (typeof SORTS)[number][0];

export default function ItemIndex({ items }: { items: Item[] }) {
  const t = useT("items");
  const tr = t; // for maps whose item is named t
  const names = useNames();
  const lang = useLang();
  const name = (i: Item) => names("items", i.id, i.name);
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
    const list = items.filter((i) => picked.every((t) => i.tags.includes(t)) && (!q || `${i.name} ${name(i)}`.toLowerCase().includes(q)));
    const byName = (a: Item, b: Item) => name(a).localeCompare(name(b), lang);
    return list.sort((a, b) => (sort === "name" ? byName(a, b) : sort === "cost" ? b.cost - a.cost || byName(a, b) : b.popularity - a.popularity));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- name follows names
  }, [items, picked, query, sort, names, lang]);
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
          <div key={group} className="items-group" data-group={group} role="group" aria-label={t(label)}>
            <span className="items-group-label">{t(label)}</span>
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
                {tr(t.label)}
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
          placeholder={t("Find an item")}
          aria-label={t("Find an item")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setParams({ q: e.target.value.trim() || null });
          }}
        />
        <div className="seg" role="group" aria-label={t("Sort")}>
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
              {t(l)}
            </button>
          ))}
        </div>
        <span className="items-count">{t("{n} of {total}", { n: shown.length, total: items.length })}</span>
      </div>
      {shown.length ? (
        <ul className="items-grid">
          {shown.map((i) => (
            <li key={i.id}>
              <Link href={`/items/${i.slug}`} className="item-card">
                {i.icon && <img src={i.icon} alt="" width={48} height={48} loading="lazy" />}
                <span className="item-card-body">
                  <b>{name(i)}</b>
                  {i.cost > 0 && (
                    <small>
                      {t("{cost} gold", {
                        cost: i.cost.toLocaleString(lang === "en" ? "en-US" : lang),
                      })}
                    </small>
                  )}
                  <span className="item-card-tags">
                    {i.tags.map((k) => (
                      <span key={k} className="item-dot" data-group={itemTag(k)?.group} title={itemTag(k) && t(itemTag(k)!.label)} />
                    ))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={t("No item has all of those")}
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
              {t("Show every item")}
            </button>
          }
        >
          {t("Remove a tag or clear the search.")}
        </EmptyState>
      )}
    </div>
  );
}
