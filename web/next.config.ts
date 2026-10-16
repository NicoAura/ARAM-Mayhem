import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;

// Lets `next dev` read Cloudflare bindings and .dev.vars.
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
