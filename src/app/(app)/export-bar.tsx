export default function ExportBar({ excelHref }: { excelHref: string }) {
  return (
    <a
      href={excelHref}
      className="rounded-md border px-3 py-1.5 text-sm hover:opacity-80"
      style={{ borderColor: "var(--qr-gold)", color: "var(--qr-gold)" }}
    >
      Download Excel
    </a>
  );
}
