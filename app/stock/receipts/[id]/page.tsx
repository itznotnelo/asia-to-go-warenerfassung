import { notFound } from "next/navigation";
import { getReceipt } from "@/lib/stock/queries";
import { supplierOptions } from "@/lib/stock/suppliers";
import { ReceiptWorkspace } from "./receipt-workspace";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ean?: string }> }) {
  const [{ id }, { ean }] = await Promise.all([params, searchParams]);
  const [receipt, suppliers] = await Promise.all([getReceipt(id), supplierOptions()]);
  if (!receipt) notFound();
  return <ReceiptWorkspace receipt={receipt} suppliers={suppliers} returnedEan={typeof ean === "string" ? ean : null} />;
}
