"use client";

import { useState, useTransition } from "react";
import {
  updateParsedLineItem,
  commitSourceDocument,
  rejectSourceDocument,
} from "../../actions";

export interface ReviewLineItem {
  id: string;
  tradeDate: string;
  lineLabel: string;
  unit: "currency" | "percent";
  displayOrder: number;
  extractedValue: number;
  correctedValue: number | null;
  flag: string;
}

function formatValue(value: number, unit: "currency" | "percent") {
  return unit === "currency" ? `$${value.toFixed(2)}` : `${value.toFixed(2)}%`;
}

export default function ReviewTable({
  documentId,
  items,
  readOnly,
}: {
  documentId: string;
  items: ReviewLineItem[];
  readOnly: boolean;
}) {
  const [corrections, setCorrections] = useState<Record<string, number | null>>({});
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleEdit(itemId: string, raw: string) {
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && Number.isNaN(parsed)) return;
    setCorrections((prev) => ({ ...prev, [itemId]: parsed }));
    startTransition(() => {
      updateParsedLineItem(itemId, parsed);
    });
  }

  function handleCommit() {
    setError(null);
    startTransition(async () => {
      try {
        await commitSourceDocument(documentId);
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setError(err.message);
        }
      }
    });
  }

  function handleDiscard() {
    if (!confirm("Discard this upload? Nothing will be saved.")) return;
    startTransition(async () => {
      try {
        await rejectSourceDocument(documentId);
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setError(err.message);
        }
      }
    });
  }

  return (
    <div className="space-y-4">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="border-b border-neutral-200 py-2 dark:border-neutral-800">Trade date</th>
            <th className="border-b border-neutral-200 py-2 dark:border-neutral-800">
              Revenue line
            </th>
            <th className="border-b border-neutral-200 py-2 text-right dark:border-neutral-800">
              Extracted
            </th>
            <th className="border-b border-neutral-200 py-2 text-right dark:border-neutral-800">
              Value to save
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const correction =
              item.id in corrections ? corrections[item.id] : item.correctedValue;
            const effectiveValue = correction ?? item.extractedValue;
            const changed = correction !== null && correction !== item.extractedValue;
            return (
              <tr key={item.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2">{item.tradeDate}</td>
                <td className="py-2">
                  {item.lineLabel}
                  {item.flag === "low_confidence" && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      check this
                    </span>
                  )}
                </td>
                <td className="py-2 text-right text-neutral-500">
                  {formatValue(item.extractedValue, item.unit)}
                </td>
                <td className="py-2 text-right">
                  {readOnly ? (
                    formatValue(effectiveValue, item.unit)
                  ) : (
                    <input
                      defaultValue={effectiveValue}
                      onBlur={(e) => handleEdit(item.id, e.target.value)}
                      inputMode="decimal"
                      className={`w-28 rounded border px-2 py-1 text-right ${
                        changed
                          ? "border-amber-400 bg-amber-50 dark:bg-amber-950"
                          : "border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800"
                      }`}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!readOnly && (
        <div className="flex gap-3">
          <button
            onClick={handleCommit}
            disabled={isPending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            Confirm and save
          </button>
          <button
            onClick={handleDiscard}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
