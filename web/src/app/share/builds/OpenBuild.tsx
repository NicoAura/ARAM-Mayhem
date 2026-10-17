"use client";

import { useEffect } from "react";

// Sends a visitor from a shared build link on to the build itself; link previews stay on the share page.
export default function OpenBuild({ href }: { href: string }) {
  useEffect(() => location.replace(href), [href]);
  return null;
}
