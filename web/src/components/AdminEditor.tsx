"use client";

import { useEffect, useMemo, useState } from "react";
import type { Content, Field } from "@/lib/content";

const KEY = "deeparam-admin";

const remember = (v: string | null) => {
  try {
    if (v) sessionStorage.setItem(KEY, v);
    else sessionStorage.removeItem(KEY);
  } catch {}
};

// Password gate, then one form per group of fields. Saving commits the text to GitHub (see lib/admin.ts).
export default function AdminEditor({ fields }: { fields: Field[] }) {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [saved, setSaved] = useState<Content>({});
  const [draft, setDraft] = useState<Content>({});
  const [sha, setSha] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "busy"; text: string } | null>(null);

  const load = async (pw: string) => {
    setStatus({ kind: "busy", text: "Unlocking…" });
    const res = await fetch("/api/admin/content", { headers: { "x-admin-password": pw } });
    const data = await res.json().catch(() => ({ error: "Unexpected response" }));
    if (!res.ok) {
      remember(null);
      setStatus({ kind: "error", text: data.error });
      return;
    }
    remember(pw);
    setPassword(pw);
    setSaved(data.content);
    setDraft(data.content);
    setSha(data.sha);
    setUnlocked(true);
    setStatus(data.sha ? null : { kind: "error", text: "Saving isn't set up yet, so changes can't be published. Showing the current text." });
  };

  useEffect(() => {
    let pw: string | null = null;
    try {
      pw = sessionStorage.getItem(KEY);
    } catch {}
    if (pw) void load(pw);
  }, []);

  const changed = useMemo(() => fields.filter((f) => (draft[f.key] ?? "") !== (saved[f.key] ?? "")).length, [fields, draft, saved]);
  const groups = useMemo(() => [...new Set(fields.map((f) => f.group))], [fields]);

  const save = async () => {
    setStatus({ kind: "busy", text: "Saving…" });
    const res = await fetch("/api/admin/content", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ content: draft, sha }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected response" }));
    if (!res.ok) return setStatus({ kind: "error", text: data.error });
    setSha(data.sha);
    setSaved(draft);
    setStatus({ kind: "ok", text: "Saved. The site shows it in about a minute." });
  };

  if (!unlocked) {
    return (
      <form
        className="card admin-login"
        method="post"
        action="/admin"
        onSubmit={(e) => {
          e.preventDefault();
          void load(password);
        }}
      >
        {/* Password managers save a login only when a username field sits beside the password. */}
        <input type="text" name="username" autoComplete="username" value="admin" readOnly tabIndex={-1} aria-hidden="true" className="visually-hidden" />
        <label htmlFor="admin-pw">Password</label>
        <div className="admin-row">
          <input id="admin-pw" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="btn" disabled={!password || status?.kind === "busy"}>
            Unlock
          </button>
        </div>
        {status && <p className={`admin-status ${status.kind}`}>{status.text}</p>}
      </form>
    );
  }

  return (
    <div className="admin">
      <p className="admin-session">
        Signed in as admin on this browser, so admin-only pages and files open here, like the{" "}
        <a className="inline-link" href="/admin/simulator">
          full Simulator
        </a>
        .{" "}
        <button
          type="button"
          className="inline-link"
          onClick={async () => {
            await fetch("/api/admin/content", { method: "DELETE" }).catch(() => null);
            remember(null);
            setUnlocked(false);
            setPassword("");
          }}
        >
          Sign out
        </button>
      </p>
      {groups.map((g) => (
        <section key={g} className="card admin-group">
          <h2>{g}</h2>
          {fields
            .filter((f) => f.group === g)
            .map((f) => {
              const id = `f-${f.key}`;
              const props = { id, value: draft[f.key] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft({ ...draft, [f.key]: e.target.value }) };
              return (
                <div key={f.key} className="admin-field">
                  <label htmlFor={id}>
                    {f.label}
                    {(draft[f.key] ?? "") !== (saved[f.key] ?? "") && <span className="admin-dot">edited</span>}
                  </label>
                  {f.long ? <textarea rows={3} {...props} /> : <input type="text" {...props} />}
                  {f.hint && <p className="admin-hint">{f.hint}</p>}
                </div>
              );
            })}
        </section>
      ))}
      <div className="admin-bar">
        <span className={`admin-status ${status?.kind ?? ""}`}>{status?.text ?? (changed ? `${changed} unsaved change${changed === 1 ? "" : "s"}` : "No changes")}</span>
        <button type="button" className="btn ghost" disabled={!changed} onClick={() => setDraft(saved)}>
          Discard
        </button>
        <button type="button" className="btn" disabled={!changed || !sha || status?.kind === "busy"} onClick={save}>
          Save and publish
        </button>
      </div>
    </div>
  );
}
