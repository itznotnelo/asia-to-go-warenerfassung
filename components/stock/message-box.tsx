import { cn } from "@/lib/utils";

/** One-line feedback after an action: green for done, red for a refusal. */
export function MessageBox({ tone, children }: { tone: "ok" | "error" | "warning"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-4 py-3 text-sm",
        tone === "ok" && "border-success/50 bg-success/10 text-success",
        tone === "error" && "border-destructive/50 bg-destructive/10 text-destructive",
        tone === "warning" && "border-primary/50 bg-primary/10 text-primary",
      )}
    >
      {children}
    </div>
  );
}
