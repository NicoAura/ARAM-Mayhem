import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The tier list used to live at /china.
  async redirects() {
    return [{ source: "/china", destination: "/tier-list", permanent: true }];
  },
};

export default nextConfig;

// Lets `next dev` read Cloudflare bindings and .dev.vars.
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
