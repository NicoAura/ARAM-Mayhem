"use client";

import { useEffect, useRef, useState } from "react";
import { THEME_EVENT, themeDocument } from "@/lib/theme";

// Same-origin iframe that grows to fit its page, so the embedded tool scrolls with the site.
export default function Embed({
  src,
  title,
  minHeight = 600,
}: {
  src: string;
  title: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);
  // Pass the page's #hash to the tool, so links like /tools/champions#Yasuo open that champion.
  const [frameSrc, setFrameSrc] = useState(src);
  useEffect(() => {
    const sync = () => setFrameSrc(src + location.hash);
    sync();
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, [src]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    const attach = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      themeDocument(doc, document.documentElement.dataset.theme);
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
