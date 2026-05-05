import { z } from "zod";

export const ServerStatusSchema = z.enum(["unknown", "online", "offline"]);
export type ServerStatus = z.infer<typeof ServerStatusSchema>;

export const ServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  sshUser: z.string(),
  status: ServerStatusSchema,
  sshKeyConfigured: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Server = z.infer<typeof ServerSchema>;
