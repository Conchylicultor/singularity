import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { createReviewSection } from "../../shared/endpoints";
import { reviewSectionsTable } from "./tables";
import { reviewSectionsServerResource } from "./resources";
import { nextRank } from "./rank";

export const handleCreate = implement(createReviewSection, async ({ body }) => {
  const id = crypto.randomUUID();
  const rank = await nextRank();

  const [row] = await db
    .insert(reviewSectionsTable)
    .values({
      id,
      name: body.name.trim(),
      patterns: body.patterns.filter((p) => typeof p === "string" && p !== ""),
      rank,
    })
    .returning();

  reviewSectionsServerResource.notify();
  return row;
});
