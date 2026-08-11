import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // next's own package.json dependencies (styled-jsx, @swc/helpers, @next/env,
  // caniuse-lite, postcss) live only in pnpm's isolated store, never hoisted
  // to a root node_modules symlink — output tracing under pnpm only reliably
  // picks up root-hoisted packages, so these are silently dropped from the
  // standalone bundle unless force-included here (and declared as direct
  // deps in package.json so pnpm hoists them in the first place).
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/styled-jsx/**",
      "./node_modules/@swc/helpers/**",
      "./node_modules/@next/env/**",
      "./node_modules/caniuse-lite/**",
      "./node_modules/postcss/**",
    ],
  },
};

export default nextConfig;
