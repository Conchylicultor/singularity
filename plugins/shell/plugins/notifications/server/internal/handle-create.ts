import { implement } from "@plugins/infra/plugins/endpoints/server";
import { createNotification } from "../../shared/endpoints";
import { recordNotification } from "./record-notification";

export const handleCreate = implement(createNotification, async ({ body }) => {
  const id = await recordNotification({
    id: body.id,
    type: body.type,
    title: body.title,
    description: body.description,
    variant: body.variant,
    linkTo: body.linkTo ?? null,
    metadata: body.metadata ?? null,
    dedupeKey: body.dedupeKey ?? null,
  });
  return { id };
});
