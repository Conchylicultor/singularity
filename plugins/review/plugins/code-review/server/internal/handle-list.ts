import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listReviewSections } from "../../shared/endpoints";
import { reviewSectionsTable } from "./tables";

export const handleList = implement(listReviewSections, async () => {
  return db
    .select()
    .from(reviewSectionsTable)
    .orderBy(
      asc(reviewSectionsTable.rank),
      asc(reviewSectionsTable.createdAt),
    );
});
