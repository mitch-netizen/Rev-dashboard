"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PORTAL_URL } from "@/lib/auth/portal";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    if (PORTAL_URL) {
      window.location.assign(new URL("/login", PORTAL_URL));
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleSignOut} className="hover:opacity-80">
      Sign out
    </button>
  );
}
