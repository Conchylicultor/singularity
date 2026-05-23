import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { ReviewSlots } from "@plugins/review/web";
import { CodeReviewSection } from "./components/code-review-section";
import { CodeReviewSummary } from "./components/code-review-summary";
import { reviewConfig } from "../shared/config";

export default {
  id: "review-code-review",
  name: "Review: Code Review",
  description:
    "File-by-file code review section for the review pane.",
  contributions: [
    ReviewSlots.Section({
      id: "code-review",
      label: "Code Review",
      component: CodeReviewSection,
      summary: CodeReviewSummary,
    }),
    ConfigV2.WebRegister({ descriptor: reviewConfig }),
  ],
} satisfies PluginDefinition;
