"use client";

import { toggleFavorite, useFavorites } from "@/lib/favorites";
import { buzz } from "@/lib/haptics";

/** A star that adds or removes a champion from this browser's favorites. */
export default function FavoriteStar({ id, name, label = false }: { id: string; name: string; label?: boolean }) {
  const on = useFavorites().includes(id);
  return (
    <button
      type="button"
      className="fav-star"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
      title={on ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        buzz();
        toggleFavorite(id);
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="m12 3.2 2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17l-5.38 2.85 1.03-6L3.3 9.6l6-.9z" />
      </svg>
      {label && <span>{on ? "Favorite" : "Add to favorites"}</span>}
    </button>
  );
}
