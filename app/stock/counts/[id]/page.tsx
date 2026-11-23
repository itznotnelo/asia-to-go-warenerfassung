import { notFound } from "next/navigation";
import { getStocktake } from "@/lib/stock/queries";
import { CountWorkspace } from "./count-workspace";

export const dynamic = "force-dynamic";

export default async function StocktakePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ean?: string }> }) {
  const [{ id }, { ean }] = await Promise.all([params, searchParams]);
  const stocktake = await getStocktake(id);
  if (!stocktake) notFound();
  return <CountWorkspace stocktake={stocktake} returnedEan={typeof ean === "string" ? ean : null} />;
}
