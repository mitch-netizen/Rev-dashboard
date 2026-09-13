import Link from "next/link";

export default function ExportBar({ excelHref, reportHref }: { excelHref: string; reportHref: string }) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href={reportHref}
        className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        Weekly Report
      </Link>
      <a
        href={excelHref}
        className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        Download Excel
      </a>
    </div>
  );
}
