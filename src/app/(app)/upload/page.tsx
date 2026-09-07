"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface UploadResult {
  filename: string;
  status: "uploading" | "done" | "error";
  documentId?: string;
  error?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploading = results.some((r) => r.status === "uploading");

  async function uploadOne(file: File, index: number) {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      const json = await res.json();
      setResults((prev) => {
        const next = [...prev];
        next[index] = res.ok
          ? { filename: file.name, status: "done", documentId: json.documentId }
          : { filename: file.name, status: "error", error: json.error ?? "Failed to parse file" };
        return next;
      });
    } catch {
      setResults((prev) => {
        const next = [...prev];
        next[index] = {
          filename: file.name,
          status: "error",
          error: "Upload failed — check your connection and try again",
        };
        return next;
      });
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // A single file keeps the old behaviour: go straight to its review screen.
    if (fileArray.length === 1 && results.length === 0) {
      setResults([{ filename: fileArray[0].name, status: "uploading" }]);
      const formData = new FormData();
      formData.append("file", fileArray[0]);
      try {
        const res = await fetch("/api/parse", { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok) {
          setResults([{ filename: fileArray[0].name, status: "error", error: json.error ?? "Failed to parse file" }]);
          return;
        }
        router.push(`/review/${json.documentId}`);
      } catch {
        setResults([
          {
            filename: fileArray[0].name,
            status: "error",
            error: "Upload failed — check your connection and try again",
          },
        ]);
      }
      return;
    }

    // Multiple files: upload and parse each independently and in parallel —
    // each report gets its own review-before-commit screen, since the
    // review/commit step is inherently per-document.
    const startIndex = results.length;
    setResults((prev) => [
      ...prev,
      ...fileArray.map((f) => ({ filename: f.name, status: "uploading" as const })),
    ]);
    await Promise.all(fileArray.map((file, i) => uploadOne(file, startIndex + i)));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Upload reports</h1>
        <p className="text-sm text-neutral-500">
          SwiftPOS Master Group Sales, Net Meter (Gaming), and/or RMS Occupancy — drop as many as
          you have at once. The report type and trade date are detected automatically for each,
          and you&apos;ll get a chance to review every figure before it&apos;s saved.
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
          if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm transition-colors ${
          dragOver
            ? "border-neutral-500 bg-neutral-50 dark:bg-neutral-900"
            : "border-neutral-300 dark:border-neutral-700"
        }`}
      >
        <p className="font-medium">Drop files here, or click to browse</p>
        <p className="mt-1 text-neutral-500">PDF or Excel — select multiple at once</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xlsx"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {results.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-900 dark:border-neutral-800">
          {results.map((r, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="truncate">{r.filename}</span>
              {r.status === "uploading" && <span className="text-neutral-400">Parsing…</span>}
              {r.status === "done" && (
                <Link
                  href={`/review/${r.documentId}`}
                  className="font-medium text-neutral-900 underline dark:text-white"
                >
                  Review
                </Link>
              )}
              {r.status === "error" && <span className="text-red-600">{r.error}</span>}
            </li>
          ))}
        </ul>
      )}

      {uploading && results.length > 1 && (
        <p className="text-xs text-neutral-400">Parsing {results.length} files…</p>
      )}
    </div>
  );
}
