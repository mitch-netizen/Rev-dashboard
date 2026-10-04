export interface WeeklyReportField {
  id: string;
  label: string;
  type: "text" | "textarea" | "date";
  hint?: string;
}

export interface WeeklyReportSection {
  id: string;
  label: string;
  fields: WeeklyReportField[];
}

// Mirrors the Jotform "Weekly Management Report" question set (44 questions,
// 6 pages + an alternate Accounts/Admin page 2) — ids match the Jotform's own
// field names so a drafted answer can be pasted straight back in. Free text
// only: this page collects notes, not submission-ready prose.
export const WEEKLY_REPORT_SECTIONS: WeeklyReportSection[] = [
  {
    id: "details",
    label: "Details",
    fields: [
      { id: "full_name", label: "Full name", type: "text" },
      { id: "email", label: "Email", type: "text" },
      { id: "department", label: "Department", type: "text" },
      { id: "week_ending", label: "Week ending", type: "date" },
    ],
  },
  {
    id: "results",
    label: "Results",
    fields: [
      { id: "completed_this_week", label: "Completed this week", type: "textarea" },
      { id: "outstanding_and_why", label: "Outstanding, and why", type: "textarea" },
      {
        id: "what_impacted_result",
        label: "What impacted the result?",
        type: "textarea",
        hint: "Dot points are fine — Claude will tie these to the specific misses above when drafting.",
      },
      { id: "opportunities_identified", label: "Opportunities identified", type: "textarea" },
      {
        id: "labour_pct_actual",
        label: "Labour % actual",
        type: "text",
        hint: "Not tracked in the dashboard — enter if you have it",
      },
      { id: "labour_pct_target", label: "Labour % target", type: "text" },
      {
        id: "roster_review",
        label:
          "Roster review — right people, right places, right times? Where did you save or waste hours? Did you adjust labour when trade didn't need it?",
        type: "textarea",
      },
    ],
  },
  {
    id: "accounts",
    label: "Accounts / Admin notes (optional)",
    fields: [
      { id: "accounts_due", label: "Due", type: "textarea" },
      { id: "accounts_critical", label: "Critical", type: "textarea" },
      { id: "accounts_coming", label: "Coming", type: "textarea" },
      { id: "accounts_costs", label: "Costs", type: "textarea" },
      { id: "accounts_payroll_issues", label: "Payroll issues", type: "textarea" },
    ],
  },
  {
    id: "people",
    label: "People",
    fields: [
      { id: "recognition", label: "Recognition — who stepped up, and why", type: "textarea" },
      { id: "training_or_coaching", label: "Training or coaching needed — who and what", type: "textarea" },
      {
        id: "concerns",
        label: "Concerns — attendance, attitude, presentation, customer service, people we keep having to follow up",
        type: "textarea",
      },
    ],
  },
  {
    id: "standards",
    label: "Standards and management team",
    fields: [
      { id: "standard_when_took_over", label: "Was your area at the expected standard when you took over?", type: "textarea" },
      { id: "what_inherited", label: "What did you inherit, and from which shift or department?", type: "textarea" },
      { id: "left_same_or_better", label: "Did you leave it at the same standard or better?", type: "textarea" },
      {
        id: "same_direction_from_managers",
        label: "Are staff getting the same direction and expectations from every manager?",
        type: "textarea",
      },
      {
        id: "where_need_consistency",
        label: "Where do we need more consistency, communication or accountability between managers?",
        type: "textarea",
      },
    ],
  },
  {
    id: "driving",
    label: "Driving business",
    fields: [
      { id: "drove_customers_revenue", label: "What did you do this week to drive customers and revenue?", type: "textarea" },
      {
        id: "social_media_marketing",
        label: "Social media and marketing — what worked, what didn't, what did you try?",
        type: "textarea",
      },
    ],
  },
  {
    id: "ownership",
    label: "Ownership and next week",
    fields: [
      { id: "risks_or_concerns", label: "Risks or concerns needing attention, support or a decision", type: "textarea" },
      { id: "ownership_beyond_shifts", label: "What did you take ownership of beyond your rostered shifts?", type: "textarea" },
      { id: "do_differently_next_week", label: "What are YOU going to do differently or better next week?", type: "textarea" },
      { id: "priority_1", label: "Top priority 1 for next week", type: "text" },
      { id: "priority_2", label: "Top priority 2 for next week", type: "text" },
      { id: "priority_3", label: "Top priority 3 for next week", type: "text" },
    ],
  },
];

export const WEEKLY_REPORT_FIELD_IDS: string[] = WEEKLY_REPORT_SECTIONS.flatMap((s) => s.fields.map((f) => f.id));
