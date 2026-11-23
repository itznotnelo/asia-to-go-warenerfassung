// Runs once when the Next server starts (also inside the Electron app).
// The Node-only part lives in its own file so the edge bundle never sees pg.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
