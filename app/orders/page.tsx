import { prisma } from "@/lib/prisma";
import { formatChf } from "@/lib/pricing";
import { EmptyState, PageHeader, pageClass } from "@/components/page";
import { OrdersTable } from "./orders-table";

// Online-Bestellungen werden per Hintergrund-Sync importiert (lib/sync/orders.ts),
// nie zur Build-Zeit eingefroren.
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const orders = await prisma.shopOrder.findMany({
    // Open = still to pick or prepare; ready/collected/cancelled are done.
    where: { status: { in: ["received", "picked"] } },
    orderBy: { createdAt: "asc" },
    include: { items: true },
  });

  return (
    <main className={pageClass()}>
      <PageHeader
        title="Online-Bestellungen"
        count={orders.length}
        description="Offene Bestellungen aus dem Webshop, älteste zuerst."
      />
      {orders.length === 0 ? (
        <EmptyState title="Keine offenen Bestellungen.">
          Neue Bestellungen aus dem Webshop erscheinen hier automatisch, sobald die App mit dem Internet verbunden ist.
        </EmptyState>
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
    </main>
  );
}
