import { SaleWorkspace } from "./sale-workspace";

export const dynamic = "force-dynamic";

export default async function SalePage({ searchParams }: { searchParams: Promise<{ ean?: string }> }) {
  const { ean } = await searchParams;
  return <SaleWorkspace returnedEan={typeof ean === "string" ? ean : null} />;
}
