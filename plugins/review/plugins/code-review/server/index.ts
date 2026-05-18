import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { Resource } from "@server/resources";
import { reviewConfig } from "../shared/config";
import { reviewSectionsServerResource } from "./internal/resources";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import { seedDefaults } from "./internal/seed";
import {
  listReviewSections,
  createReviewSection,
  updateReviewSection,
  deleteReviewSection,
} from "../shared/endpoints";

export default {
  id: "review-code-review",
  name: "Review: Code Review",
  description:
    "File-by-file code review section for the review pane.",
  httpRoutes: {
    [listReviewSections.route]: handleList,
    [createReviewSection.route]: handleCreate,
    [updateReviewSection.route]: handleUpdate,
    [deleteReviewSection.route]: handleDelete,
  },
  contributions: [
    Config.Field(reviewConfig),
    Resource.Declare(reviewSectionsServerResource),
  ],
  async onReady() {
    await seedDefaults();
  },
} satisfies ServerPluginDefinition;
