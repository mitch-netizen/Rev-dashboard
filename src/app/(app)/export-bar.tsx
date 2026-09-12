"use client";

export default function ExportBar({ excelHref }: { excelHref: string }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        Print / Save PDF
      </button>
      <a
        href={excelHref}
        className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        Download Excel
      </a>
    </div>
  );
}
