import type { Phase } from "../../core";

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
    "bg-warning/15 text-warning hover:bg-warning/25",
  design_review:
    "bg-categorical-1/15 text-categorical-1 hover:bg-categorical-1/25",
  implementation_review:
    "bg-categorical-6/15 text-categorical-6 hover:bg-categorical-6/25",
  investigating:
    "bg-muted text-muted-foreground hover:bg-muted/80",
  executing:
    "bg-success/15 text-success hover:bg-success/25",
  other:
    "bg-muted text-muted-foreground hover:bg-muted/80",
};
