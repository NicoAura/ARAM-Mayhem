"use client";

import { useEffect, useState } from "react";

// Home's count of games players have shared from My Stats (/api/games), read when the page opens
// since it changes as people share. Shows nothing until there's a number.

export default function SharedGamesStat() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((d) => typeof d.all === "number" && setN(d.all))
      .catch(() => {});
  }, []);
  if (n === null) return null;
  return (
    <div>
      <b>{n.toLocaleString("en-US")}</b>
      <span>games shared by players</span>
    </div>
  );
}
