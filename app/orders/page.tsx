import { prisma } from "@/lib/prisma";
import { formatChf } from "@/lib/pricing";
import { OrdersTable } from "./orders-table";

// Online-Bestellungen werden per Hintergrund-Sync importiert (lib/sync/orders.ts),
// nie zur Build-Zeit eingefroren.
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const orders = await prisma.shopOrder.findMany({
    where: { status: { not: "ready" } },
    orderBy: { createdAt: "asc" },
    include: { items: true },
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold">
        Online-Bestellungen <span className="font-numeric text-muted-foreground">({orders.length})</span>
      </h1>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offenen Bestellungen.</p>
      ) : (
        <OrdersTable
          orders={orders.map((order) => ({
            id: order.id,
            status: order.status,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            fulfilmentType: order.fulfilmentType,
            totalChf: formatChf(order.totalRappen),
            notes: order.notes,
            createdAt: order.createdAt.toISOString(),
            items: order.items.map((item) => ({ id: item.id, nameDe: item.nameDe, qty: item.qty })),
          }))}
        />
      )}
    </div>
  );
}
