import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { reviewSectionsTable } from "./tables";
import type { ReviewSection } from "../../shared";

export const reviewSectionsServerResource = defineResource<ReviewSection[]>({
  key: "review-sections",
  mode: "push",
  async loader() {
    const rows = await db
      .select()
      .from(reviewSectionsTable)
      .orderBy(
        asc(reviewSectionsTable.rank),
        asc(reviewSectionsTable.createdAt),
      );
    return rows as unknown as ReviewSection[];
  },
});
