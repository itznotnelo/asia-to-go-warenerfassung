import { NextResponse, type NextRequest } from "next/server";
import { checkLocalRequest } from "@/lib/security/request-guard";

// Ticket #3071 (review #38): reject DNS-rebinding Hosts and cross-origin
// writes before any page, server action or /api route runs. PORT is set by
// electron/src/server.ts for the packaged app; in `pnpm dev` it is usually
// unset, then any loopback port is accepted.
export function middleware(request: NextRequest): NextResponse {
  const result = checkLocalRequest({
    method: request.method,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    expectedPort: process.env.PORT || undefined,
  });
  if (!result.ok) {
    return new NextResponse("Forbidden", { status: result.status, headers: { "x-guard": result.reason } });
  }
  return NextResponse.next();
}
