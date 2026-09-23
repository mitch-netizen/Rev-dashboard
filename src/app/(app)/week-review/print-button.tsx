"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border px-3 py-1.5 text-sm hover:opacity-80"
      style={{ borderColor: "var(--qr-gold)", color: "var(--qr-gold)" }}
    >
      Print / Save PDF
    </button>
  );
}
