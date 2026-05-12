import type { Phase } from "../../shared/resources";

export const PHASE_LABEL: Record<Phase, string> = {
  clarification_needed: "Clarification",
  design_review: "Design review",
  implementation_review: "Impl review",
  investigating: "Investigating",
  executing: "Executing",
  other: "Other",
};

export const PHASE_CLASSES: Record<Phase, string> = {
  clarification_needed:
    "bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25",
  design_review:
    "bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25",
  implementation_review:
    "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/25",
  investigating:
    "bg-slate-500/15 text-slate-700 dark:text-slate-300 hover:bg-slate-500/25",
  executing:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25",
  other:
    "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-500/25",
};
