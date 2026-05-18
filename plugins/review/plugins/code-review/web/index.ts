import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Config } from "@plugins/config/web";
import { ReviewSlots } from "@plugins/review/web";
import { CodeReviewSection } from "./components/code-review-section";
import { CodeReviewSummary } from "./components/code-review-summary";
import { ReviewSectionsSettings } from "./components/review-sections-settings";
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
    Config.Spec(reviewConfig),
    Config.Section({
      id: "review-sections",
      title: "Review Sections",
      description:
        "File groupings shown in the review pane. Files matching a section's patterns are grouped under that section header.",
      component: ReviewSectionsSettings,
    }),
  ],
} satisfies PluginDefinition;
