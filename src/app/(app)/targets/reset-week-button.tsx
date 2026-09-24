"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetWeekToStandingPattern } from "./week-actions";

export default function ResetWeekButton({ weekId }: { weekId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!window.confirm("Discard every target already entered for this week and replace it with the current standing pattern?")) {
      return;
    }
    startTransition(async () => {
      await resetWeekToStandingPattern(weekId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-md border px-3 py-1.5 text-sm hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ borderColor: "var(--qr-gold)", color: "var(--qr-gold)" }}
    >
      {isPending ? "Resetting…" : "Reset week to standing pattern"}
    </button>
  );
}
