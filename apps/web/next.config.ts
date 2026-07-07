import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // @merai/core is shipped as TypeScript source; Next compiles it in-place.
  transpilePackages: ["@merai/core"],
};

export default withNextIntl(nextConfig);
