import type { Metadata } from "next";
import AccountPanel from "@/components/AccountPanel";
import Intro from "@/components/Intro";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = {
  ...pageMeta("/account", "Your account", "Sign in or create a DeepARAM account so your starred champions and settings follow you to every device."),
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return (
    <>
      <Intro eyebrow="Account" title="Your account.">
        Sign in to keep your starred champions and settings on every device, and connect the Riot account you play on.
      </Intro>
      <AccountPanel />
    </>
  );
}
