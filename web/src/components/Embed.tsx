"use client";

import { useEffect, useRef, useState } from "react";

// Same-origin iframe that grows to fit its page, so the embedded tool scrolls with the site.
export default function Embed({ src, title, minHeight = 600 }: { src: string; title: string; minHeight?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    const attach = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      const fit = () => setHeight(Math.max(minHeight, doc.documentElement.scrollHeight));
      fit();
      observer?.disconnect();
      observer = new ResizeObserver(fit);
      observer.observe(doc.body);
    };
    frame.addEventListener("load", attach);
    attach();
    return () => {
      frame.removeEventListener("load", attach);
      observer?.disconnect();
    };
  }, [minHeight]);

  return (
    <div className="embed">
      <iframe ref={ref} src={src} title={title} style={{ height }} />
      <a className="embed-open" href={src} target="_blank" rel="noreferrer">
        Open full screen ↗
      </a>
    </div>
  );
}
