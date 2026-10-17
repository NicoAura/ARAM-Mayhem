import type { NextConfig } from "next";

// Sent with every page. The site frames its own /embed pages, so framing is limited to itself.
// The content policy only reports for now (inline theme scripts, embeds); enforce it once it's quiet.
const CSP = [
  "default-src 'self'",
  // challenges.cloudflare.com: the bot check on the Simulator leaderboard and account sign-in (lib/bot-check.ts), script and frame.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' https://cloudflareinsights.com",
  "frame-src 'self' https://challenges.cloudflare.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Old addresses of moved tabs. A #hash (like /tools/champions#Yasuo) carries over.
  async redirects() {
    return [
      ["/china", "/tier-list"],
      ["/tools", "/"],
      ["/tools/simulator", "/simulator"],
      ["/tools/lab", "/kitchen"],
      ["/lab", "/kitchen"],
      ["/tools/champions", "/champions"],
      ["/tools/guide", "/info"],
      ["/guide", "/info"],
      ["/tools/fun", "/kitchen"],
      ["/tools/cook-builds", "/kitchen"],
      ["/tools/kitchen", "/kitchen"],
      // The owner's tools moved under the account page when accounts replaced the editor password.
      ["/admin", "/account/edit"],
      ["/admin/simulator", "/simulator"],
      // The 3D Simulator opens from the owner-only switch on /simulator now.
      ["/account/simulator", "/simulator"],
    ]
      .map(([source, destination]) => ({ source, destination, permanent: true }))
      .concat([
        // The build tools and augment draft share pages now; the old addresses keep their query.
        { source: "/what-to-build", destination: "/builds", permanent: true },
        { source: "/builder", destination: "/builds?tab=editor", permanent: true },
        { source: "/compare", destination: "/builds?tab=compare", permanent: true },
        { source: "/synergy", destination: "/builds?tab=team", permanent: true },
        { source: "/draft", destination: "/augments?tab=draft", permanent: true },
      ]);
  },
};

export default nextConfig;

// Lets `next dev` read Cloudflare bindings and .dev.vars.
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
