import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { reviewSectionsTable } from "./tables";
import { reviewSectionsServerResource } from "./resources";

export async function handleUpdate(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return new Response("Missing id", { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    patterns?: string[];
  };

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
    .where(eq(reviewSectionsTable.id, id))
    .returning({ id: reviewSectionsTable.id });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!updated) return new Response("Not found", { status: 404 });

  reviewSectionsServerResource.notify();
  return Response.json({ ok: true });
}
