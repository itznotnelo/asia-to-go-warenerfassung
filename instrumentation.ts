// Runs once when the Next server starts (also inside the Electron app).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { prisma } = await import("@/lib/prisma");
    const { backfillLegacyStock } = await import("@/lib/stock/legacy");
    // v0.2 -> v0.3: stock values without a ledger get their opening movement.
    const created = await prisma.$transaction((tx) => backfillLegacyStock(tx));
    if (created > 0) console.log(`[stock] opening movements created for ${created} article(s) from v0.2`);
  } catch (error) {
    // Never block the start: the backfill is idempotent and retried next start.
    console.error("[stock] legacy stock backfill failed:", error);
  }
}
