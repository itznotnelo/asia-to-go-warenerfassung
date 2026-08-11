// Standalone Prisma config used only by the packaged Electron app's runtime
// migration step (see electron/src/migrate.ts). Unlike prisma.config.ts
// (used for local dev via `prisma migrate dev`), this has no imports at all
// — it's bundled as a plain data file alongside schema.prisma and
// migrations/, and deliberately avoids depending on the "prisma" package
// being resolvable relative to wherever it ends up on disk once packaged.
// Electron sets DATABASE_URL directly on the child process env, so there's
// no dotenv loading here either.
const config = {
  schema: "./schema.prisma",
  migrations: {
    path: "./migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
};

export default config;
