"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";

const updateStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["received", "picked", "ready"]),
});

/** Zwei Klicks weiter je Bestellung (empfangen -> gepickt -> bereit) - keine eigene "zurück"-Aktion nötig, siehe Ticket #1369. */
export async function updateOrderStatus(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = updateStatusSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "Ungültige Eingabe." };
  }
  await prisma.shopOrder.update({ where: { id: parsed.data.id }, data: { status: parsed.data.status } });
  return { ok: true };
}
