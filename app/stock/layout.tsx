import { StockNav } from "@/components/stock/stock-nav";

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StockNav />
      {children}
    </>
  );
}
