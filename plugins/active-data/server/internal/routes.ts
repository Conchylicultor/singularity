import { and, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _activeDataBindings } from "./tables";
import { activeDataBindingsResource } from "./resource";

interface BindingKeyParams {
  conversationId?: string;
  messageId?: string;
  tag?: string;
  occurrenceIndex?: string;
}

interface ParsedKey {
  conversationId: string;
  messageId: string;
  tag: string;
  occurrenceIndex: number;
}

function parseKey(params: BindingKeyParams): ParsedKey | { error: string } {
  const { conversationId, messageId, tag } = params;
  if (!conversationId || !messageId || !tag) {
    return { error: "Missing key segment" };
  }
  const occurrenceIndex = Number(params.occurrenceIndex);
  if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) {
    return { error: "occurrenceIndex must be a non-negative integer" };
  }
  return { conversationId, messageId, tag, occurrenceIndex };
}

export async function handlePutBinding(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const key = parseKey(params);
  if ("error" in key) {
    return Response.json({ error: key.error }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { payload?: unknown } | null;
  if (!body || !("payload" in body)) {
    return Response.json(
      { error: "body must be { payload: unknown }" },
      { status: 400 },
    );
  }

  await db
    .insert(_activeDataBindings)
    .values({
      conversationId: key.conversationId,
      messageId: key.messageId,
      tag: key.tag,
      occurrenceIndex: key.occurrenceIndex,
      payload: body.payload,
    })
    .onConflictDoUpdate({
      target: [
        _activeDataBindings.conversationId,
        _activeDataBindings.messageId,
        _activeDataBindings.tag,
        _activeDataBindings.occurrenceIndex,
      ],
      set: {
        payload: body.payload,
        updatedAt: new Date(),
      },
    });

  activeDataBindingsResource.notify({ conversationId: key.conversationId });
  return Response.json({ ok: true });
}

export async function handleDeleteBinding(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const key = parseKey(params);
  if ("error" in key) {
    return Response.json({ error: key.error }, { status: 400 });
  }

  await db
    .delete(_activeDataBindings)
    .where(
      and(
        eq(_activeDataBindings.conversationId, key.conversationId),
        eq(_activeDataBindings.messageId, key.messageId),
        eq(_activeDataBindings.tag, key.tag),
        eq(_activeDataBindings.occurrenceIndex, key.occurrenceIndex),
      ),
    );

  activeDataBindingsResource.notify({ conversationId: key.conversationId });
  return Response.json({ ok: true });
}
