import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old addresses of moved tabs. A #hash (like /tools/champions#Yasuo) carries over.
  async redirects() {
    return [
      ["/china", "/tier-list"],
      ["/simulator", "/tools/simulator"],
      ["/tools/champions", "/champions"],
      ["/tools/guide", "/info"],
      ["/guide", "/info"],
      ["/tools/fun", "/tools/lab"],
      ["/tools/cook-builds", "/tools/lab#cook-builds"],
      ["/tools/kitchen", "/tools/lab#cook-builds"],
    ].map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;

// Lets `next dev` read Cloudflare bindings and .dev.vars.
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
