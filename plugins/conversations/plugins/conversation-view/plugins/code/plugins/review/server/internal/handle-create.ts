import { db } from "@plugins/database/server";
import { reviewSectionsTable } from "./tables";
import { reviewSectionsServerResource } from "./resources";
import { nextRank } from "./rank";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    patterns?: string[];
  };
  if (typeof body.name !== "string" || body.name.trim() === "") {
    return Response.json({ error: "name required" }, { status: 400 });
  }
  if (!Array.isArray(body.patterns)) {
    return Response.json({ error: "patterns required" }, { status: 400 });
  }

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
  return Response.json(row, { status: 201 });
}
