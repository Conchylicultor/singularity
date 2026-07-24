import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { forgetServerHostKey } from "../../shared/endpoints";
import { _deployServersHealthExt } from "./tables";

/**
 * Clear the pinned known_hosts line. The next check runs in `learn` mode again
 * and re-pins whatever the host now presents — so a legitimately reinstalled
 * server recovers, but only because the user said so.
 *
 * A targeted UPDATE rather than the extension handle's `upsert`: forgetting a
 * pin must never *create* a health row (there is no verdict to record yet), and
 * `returning()` makes "no row" the 404 without a separate read.
 */
export const handleForgetHostKey = implement(
  forgetServerHostKey,
  async ({ params }) => {
    const [row] = await db
      .update(_deployServersHealthExt)
      .set({ hostKeyLine: null, updatedAt: new Date() })
      .where(eq(_deployServersHealthExt.parentId, params.id))
      .returning();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!row) throw new HttpError(404, "This server has never been checked.");
  },
);
