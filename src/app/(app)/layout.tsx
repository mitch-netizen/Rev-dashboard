import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="print:hidden" style={{ background: "var(--qr-header-bg)", borderBottom: "1px solid var(--qr-line)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-display text-sm font-bold" style={{ color: "var(--qr-header-fg)" }}>
              The Queens Gladstone
            </span>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="hover:opacity-80" style={{ color: "var(--qr-header-fg)" }}>
                Week
              </Link>
              <Link href="/upload" className="hover:opacity-80" style={{ color: "var(--qr-header-fg)" }}>
                Upload
              </Link>
              <Link href="/targets" className="hover:opacity-80" style={{ color: "var(--qr-header-fg)" }}>
                Targets
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm" style={{ color: "var(--qr-header-fg)", opacity: 0.75 }}>
            <span>{user?.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
