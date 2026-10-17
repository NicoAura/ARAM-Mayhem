"use client";

import { useEffect, useRef, useState } from "react";
import { THEME_EVENT, themeDocument } from "@/lib/theme";

// The site fills the window, so embedded pages' own width caps are lifted too.
const FULL_WIDTH = "body,main,.wrap{max-width:none!important}";
function fullWidth(doc: Document) {
  if (doc.getElementById("deeparam-full-width")) return;
  const style = doc.createElement("style");
  style.id = "deeparam-full-width";
  style.textContent = FULL_WIDTH;
  doc.head.append(style);
}

// The site's search keys (/, ⌘K, Ctrl+K) work inside embedded tools too: the key is handed to the
// page, where the header search listens for it.
function searchKeys(doc: Document) {
  if (doc.documentElement.dataset.searchKeys) return;
  doc.documentElement.dataset.searchKeys = "1";
  doc.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
    const combo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
    if (!combo && (e.key !== "/" || typing)) return;
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey }));
  });
}

// Same-origin iframe that grows to fit its page, so the embedded tool scrolls with the site.
export default function Embed({
  src,
  title,
  minHeight = 0,
  hash,
}: {
  src: string;
  title: string;
  minHeight?: number;
  /** Opens the tool at this #part instead of following the page's (a champion's own page). */
  hash?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);
  // Pass the page's #hash to the tool, so links to a tool can name what it opens.
  const [frameSrc, setFrameSrc] = useState(hash ? `${src}#${hash}` : src);
  useEffect(() => {
    if (hash) return;
    const sync = () => setFrameSrc(src + location.hash);
    sync();
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, [src, hash]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    const attach = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      themeDocument(doc, document.documentElement.dataset.theme);
      fullWidth(doc);
      searchKeys(doc);
      const fit = () =>
        setHeight(Math.max(minHeight, doc.documentElement.scrollHeight));
      fit();
      observer?.disconnect();
      observer = new ResizeObserver(fit);
      observer.observe(doc.body);
    };
    const retheme = () =>
      frame.contentDocument &&
      themeDocument(
        frame.contentDocument,
        document.documentElement.dataset.theme,
      );
    frame.addEventListener("load", attach);
    window.addEventListener(THEME_EVENT, retheme);
    attach();
    return () => {
      frame.removeEventListener("load", attach);
      window.removeEventListener(THEME_EVENT, retheme);
      observer?.disconnect();
    };
  }, [minHeight]);

  return (
    <div className="embed">
      <iframe ref={ref} src={frameSrc} title={title} style={{ height }} />
    </div>
  );
}
