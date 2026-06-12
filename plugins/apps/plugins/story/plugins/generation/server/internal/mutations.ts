import { and, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _storyGeneratedUnits } from "./tables";
import { storyGeneratedUnitsResource } from "./resource";

const t = _storyGeneratedUnits;

function whereUnit(pageId: string, kind: string, unitId: string) {
  return and(eq(t.pageId, pageId), eq(t.kind, kind), eq(t.unitId, unitId));
}

// Upsert the unit into "generating", recording the turn's inputHash/prompt/
// instruction and clearing prior output/error. Notifies the live-state resource
// so every surface re-renders.
export async function startUnitGeneration(args: {
  pageId: string;
  kind: string;
  unitId: string;
  inputHash: string;
  prompt: string;
  instruction?: string;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(t)
    .values({
      pageId: args.pageId,
      kind: args.kind,
      unitId: args.unitId,
      inputHash: args.inputHash,
      status: "generating",
      output: null,
      prompt: args.prompt,
      instruction: args.instruction ?? null,
      error: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [t.pageId, t.kind, t.unitId],
      set: {
        inputHash: args.inputHash,
        status: "generating",
        output: null,
        prompt: args.prompt,
        instruction: args.instruction ?? null,
        error: null,
        updatedAt: now,
      },
    });
  storyGeneratedUnitsResource.notify();
}

export async function completeUnitGeneration(args: {
  pageId: string;
  kind: string;
  unitId: string;
  output: string;
}): Promise<void> {
  await db
    .update(t)
    .set({ output: args.output, status: "ready", error: null, updatedAt: new Date() })
    .where(whereUnit(args.pageId, args.kind, args.unitId));
  storyGeneratedUnitsResource.notify();
}

export async function failUnitGeneration(args: {
  pageId: string;
  kind: string;
  unitId: string;
  error: string;
}): Promise<void> {
  await db
    .update(t)
    .set({ status: "error", error: args.error, updatedAt: new Date() })
    .where(whereUnit(args.pageId, args.kind, args.unitId));
  storyGeneratedUnitsResource.notify();
}
