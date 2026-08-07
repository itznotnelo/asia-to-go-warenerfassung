import { readFile } from "node:fs/promises";
import path from "node:path";
import { isPathWithinRoot } from "@/lib/safe-path";

const IMAGE_ROOT = process.env.IMAGE_ROOT ?? path.join(process.cwd(), "data", "images");

/** Liefert lokal gespeicherte Produktbilder aus — data/images/ liegt bewusst ausserhalb von public/, siehe CLAUDE.md. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const requested = path.join(IMAGE_ROOT, ...segments);

  if (!isPathWithinRoot(IMAGE_ROOT, requested)) {
    return Response.json({ error: "Ungültiger Pfad." }, { status: 400 });
  }

  try {
    const file = await readFile(requested);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return Response.json({ error: "Bild nicht gefunden." }, { status: 404 });
  }
}
