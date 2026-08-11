import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Next's own output tracer (@vercel/nft) keeps silently missing individual
  // packages that are technically hoisted to root node_modules but only
  // reachable via a require() it can't statically follow (next's own
  // require-hook.js, @prisma/client's conditional exports, styled-jsx's
  // dynamic resolution, and each of THEIR OWN transitive deps in turn).
  // A blanket "./node_modules/**" include overflows @vercel/nft's call
  // stack, so this has to be an explicit list — verified complete by
  // actually running the standalone server and exercising every route.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/styled-jsx/**",
      "./node_modules/@swc/helpers/**",
      "./node_modules/@next/env/**",
      "./node_modules/caniuse-lite/**",
      "./node_modules/postcss/**",
      "./node_modules/react-dom/**",
      "./node_modules/scheduler/**",
      "./node_modules/@prisma/client/**",
      "./node_modules/@prisma/adapter-pg/**",
      "./node_modules/@prisma/debug/**",
      "./node_modules/@prisma/driver-adapter-utils/**",
      "./node_modules/client-only/**",
      "./node_modules/@prisma/client-runtime-utils/**",
      "./node_modules/pg-connection-string/**",
      "./node_modules/pg-int8/**",
      "./node_modules/pg-pool/**",
      "./node_modules/pg-protocol/**",
      "./node_modules/pg-types/**",
      "./node_modules/pgpass/**",
      "./node_modules/postgres-array/**",
      "./node_modules/postgres-bytea/**",
      "./node_modules/postgres-date/**",
      "./node_modules/postgres-interval/**",
      "./node_modules/xtend/**",
      "./node_modules/split2/**",
      "./node_modules/nanoid/**",
      "./node_modules/picocolors/**",
      "./node_modules/source-map-js/**",
      "./node_modules/semver/**",
      "./node_modules/tslib/**",
      "./node_modules/detect-libc/**",
      "./node_modules/@img/colour/**",
    ],
  },
};

export default nextConfig;
