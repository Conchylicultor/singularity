import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { deleteTweakcnTheme } from "../../core/endpoints";
import { _tweakcnThemes } from "./tables";

export const handleDelete = implement(
  deleteTweakcnTheme,
  async ({ params }) => {
    await db
      .delete(_tweakcnThemes)
      .where(eq(_tweakcnThemes.id, params.id));

    return { ok: true };
  },
);
