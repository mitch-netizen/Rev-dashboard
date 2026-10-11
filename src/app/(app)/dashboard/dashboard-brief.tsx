function Callout({ label, value, accent }: { label: string; value: string; accent?: "gold" | "red" }) {
  if (!value) return null;
  return (
    <div
      className="rounded-none border p-4"
      style={{
        background: "var(--qr-card-bg)",
        borderColor: "var(--qr-line)",
        borderLeft: `5px solid ${accent === "red" ? "var(--qr-red)" : "var(--qr-gold)"}`,
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--qr-ink-soft)" }}>
        {label}
      </div>
      <p className="mt-1.5 text-sm" style={{ color: "var(--qr-ink)" }}>
        {value}
      </p>
    </div>
  );
}

export default function DashboardBrief({ answers }: { answers: Record<string, string> }) {
  const priorities = [answers.priority_1, answers.priority_2, answers.priority_3].filter(Boolean);
  const hasAnything =
    answers.recognition || answers.concerns || answers.risks_or_concerns || priorities.length > 0;

  if (!hasAnything) {
    return (
      <p className="text-sm" style={{ color: "var(--qr-ink-faint)" }}>
        No Weekly Report notes saved for this week yet — fill in the Weekly Report tab and this fills in
        automatically.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Callout label="Recognition" value={answers.recognition ?? ""} />
      <Callout label="Concerns" value={answers.concerns ?? ""} accent="red" />
      <Callout label="Risks or concerns needing attention" value={answers.risks_or_concerns ?? ""} accent="red" />
      {priorities.length > 0 && (
        <div
          className="rounded-none border p-4"
          style={{ background: "var(--qr-card-bg)", borderColor: "var(--qr-line)", borderLeft: "5px solid var(--qr-gold)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--qr-ink-soft)" }}>
            Priorities for next week
          </div>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm" style={{ color: "var(--qr-ink)" }}>
            {priorities.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
