import { createClient } from "@supabase/supabase-js";

// Server-only: the service role key bypasses RLS entirely, so this is only
// for trusted server-side paths with no user session to scope by — the
// inbound-email webhook, specifically. Never expose this client or its key
// to the browser.
export function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
