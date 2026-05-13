import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { reviewSectionsTable } from "./tables";
import { reviewSectionsServerResource } from "./resources";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return new Response("Missing id", { status: 400 });

  await db
    .delete(reviewSectionsTable)
    .where(eq(reviewSectionsTable.id, id));

  reviewSectionsServerResource.notify();
  return Response.json({ ok: true });
}
