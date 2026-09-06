"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function UploadPage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to parse file");
        setUploading(false);
        return;
      }
      router.push(`/review/${json.documentId}`);
    } catch {
      setError("Upload failed — check your connection and try again");
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Upload a report</h1>
        <p className="text-sm text-neutral-500">
          SwiftPOS Master Group Sales, Net Meter (Gaming), or RMS Occupancy. The report type and
          trade date are detected automatically — you&apos;ll get a chance to review every figure
          before it&apos;s saved.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm transition-colors ${
          dragOver
            ? "border-neutral-500 bg-neutral-50 dark:bg-neutral-900"
            : "border-neutral-300 dark:border-neutral-700"
        }`}
      >
        {uploading ? (
          <p>Parsing…</p>
        ) : (
          <>
            <p className="font-medium">Drop a file here, or click to browse</p>
            <p className="mt-1 text-neutral-500">PDF or Excel</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
