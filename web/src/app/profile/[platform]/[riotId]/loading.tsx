import Skeleton from "@/components/Skeleton";

// Shown while a player's page is fetched.
export default function Loading() {
  return <Skeleton kind="cards" rows={3} label="Loading player…" />;
}
