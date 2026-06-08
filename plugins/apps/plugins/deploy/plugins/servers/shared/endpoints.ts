import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ServerSchema } from "./schemas";

const ServerRowSchema = ServerSchema.omit({ sshKeyConfigured: true });

export const CreateServerBodySchema = z.object({
  name: z.string().optional(),
  host: z.string(),
  port: z.number().optional(),
  sshUser: z.string().optional(),
  sshPrivateKey: z.string().optional(),
});
export type CreateServerBody = z.infer<typeof CreateServerBodySchema>;

export const UpdateServerBodySchema = z.object({
  name: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  sshUser: z.string().optional(),
  sshPrivateKey: z.string().optional(),
});
export type UpdateServerBody = z.infer<typeof UpdateServerBodySchema>;

export const listServers = defineEndpoint({
  route: "GET /api/deploy/servers",
  response: z.array(ServerSchema),
});

export const createServer = defineEndpoint({
  route: "POST /api/deploy/servers",
  body: CreateServerBodySchema,
  response: ServerSchema,
});

export const getServer = defineEndpoint({
  route: "GET /api/deploy/servers/:id",
  response: ServerSchema,
});

export const updateServer = defineEndpoint({
  route: "PATCH /api/deploy/servers/:id",
  body: UpdateServerBodySchema,
  response: ServerRowSchema,
});

export const deleteServer = defineEndpoint({
  route: "DELETE /api/deploy/servers/:id",
});
