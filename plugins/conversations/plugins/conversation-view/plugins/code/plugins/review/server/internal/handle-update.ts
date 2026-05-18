import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateReviewSection } from "../../shared/endpoints";
import { reviewSectionsTable } from "./tables";
import { reviewSectionsServerResource } from "./resources";

export const handleUpdate = implement(updateReviewSection, async ({ params, body }) => {
  const patch: Partial<typeof reviewSectionsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (Array.isArray(body.patterns)) {
    patch.patterns = body.patterns.filter(
      (p) => typeof p === "string" && p !== "",
    );
  }

  const [updated] = await db
    .update(reviewSectionsTable)
    .set(patch)
    .where(eq(reviewSectionsTable.id, params.id))
    .returning({ id: reviewSectionsTable.id });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!updated) throw new HttpError(404, "Not found");

  reviewSectionsServerResource.notify();
  return { ok: true };
});
