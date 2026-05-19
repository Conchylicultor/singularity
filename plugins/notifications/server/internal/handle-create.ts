import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { createNotification } from "../../shared/endpoints";
import { _notifications } from "./tables";
import { notificationsResource } from "./resources";

export const handleCreate = implement(createNotification, async ({ body }) => {
  await db.insert(_notifications).values({
    id: body.id,
    type: body.type,
    title: body.title,
    description: body.description,
    variant: body.variant,
    linkTo: body.linkTo ?? null,
    metadata: body.metadata ?? null,
  });
  notificationsResource.notify();
  return { id: body.id };
});
