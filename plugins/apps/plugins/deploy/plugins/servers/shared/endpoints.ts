import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ServerSchema } from "./schemas";

const ServerRowSchema = ServerSchema.omit({ sshKeyConfigured: true });

export const CreateServerBodySchema = z.object({
  name: z.string().optional(),
  host: z.string(),
  port: z.number().optional(),
  sshUser: z.string().optional(),
  consoleUrl: z.string().optional(),
  sshPrivateKey: z.string().optional(),
});
export type CreateServerBody = z.infer<typeof CreateServerBodySchema>;

export const UpdateServerBodySchema = z.object({
  name: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  sshUser: z.string().optional(),
  consoleUrl: z.string().nullable().optional(),
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

export const GenerateKeypairBodySchema = z.object({
  /** Required to regenerate over an already-configured key (otherwise 409). */
  replace: z.boolean().optional(),
});
export type GenerateKeypairBody = z.infer<typeof GenerateKeypairBodySchema>;

/**
 * Generates an ed25519 keypair for the server: the private half goes straight
 * into the secrets store (never returned), the public half is persisted on the
 * row and returned for the user to install on the server.
 */
export const generateSshKeypair = defineEndpoint({
  route: "POST /api/deploy/servers/:id/ssh-keypair",
  body: GenerateKeypairBodySchema,
  response: z.object({ publicKey: z.string() }),
});
