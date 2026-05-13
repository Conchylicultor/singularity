import { db } from "@plugins/database/server";
import { reviewSectionsTable } from "./tables";
import { reviewSectionsServerResource } from "./resources";
import { nextRank } from "./rank";

export async function seedDefaults(): Promise<void> {
  const existing = await db
    .select({ id: reviewSectionsTable.id })
    .from(reviewSectionsTable)
    .limit(1);
  if (existing.length > 0) return;

  const rank = await nextRank();
  await db.insert(reviewSectionsTable).values({
    id: crypto.randomUUID(),
    name: "Auto-generated",
    patterns: [
      "**/CLAUDE.md",
      "docs/plugins-compact.md",
      "docs/plugins-details.md",
      "server/src/db/migrations/",
    ],
    rank,
  });

  reviewSectionsServerResource.notify();
}
