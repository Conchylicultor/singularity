import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { deleteReviewSection } from "../../shared/endpoints";
import { reviewSectionsTable } from "./tables";
import { reviewSectionsServerResource } from "./resources";

export const handleDelete = implement(deleteReviewSection, async ({ params }) => {
  await db
    .delete(reviewSectionsTable)
    .where(eq(reviewSectionsTable.id, params.id));

  reviewSectionsServerResource.notify();
  return { ok: true };
});
