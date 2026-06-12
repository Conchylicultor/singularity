import { z } from "zod";

export const NotificationVariantSchema = z.enum([
  "error",
  "warning",
  "info",
  "success",
]);
export type NotificationVariant = z.infer<typeof NotificationVariantSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  variant: NotificationVariantSchema,
  dismissed: z.boolean(),
  read: z.boolean(),
  muted: z.boolean(),
  linkTo: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.coerce.date(),
});
export type Notification = z.infer<typeof NotificationSchema>;
