import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // api/inbound-email is called by the email provider with no session; it has its own auth.
    "/((?!_next/static|_next/image|favicon.ico|api/inbound-email|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
