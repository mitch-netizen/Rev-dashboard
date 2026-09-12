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
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold">The Queens Gladstone</span>
            <nav className="flex gap-4 text-sm text-neutral-600 dark:text-neutral-400">
              <Link href="/" className="hover:text-neutral-950 dark:hover:text-white">
                Current Week
              </Link>
              <Link href="/upload" className="hover:text-neutral-950 dark:hover:text-white">
                Upload
              </Link>
              <Link href="/review" className="hover:text-neutral-950 dark:hover:text-white">
                Review Queue
              </Link>
              <Link href="/recovery" className="hover:text-neutral-950 dark:hover:text-white">
                Recovery
              </Link>
              <Link href="/targets" className="hover:text-neutral-950 dark:hover:text-white">
                Targets
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <span>{user?.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
