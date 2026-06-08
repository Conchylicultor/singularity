import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const SecretRefBodySchema = z.object({
  namespace: z.string(),
  key: z.string(),
});

const SecretSetBodySchema = z.object({
  namespace: z.string(),
  key: z.string(),
  value: z.string(),
});

const SecretListBodySchema = z.object({
  namespace: z.string(),
});

export const secretsGet = defineEndpoint({
  route: "POST /api/secrets/get",
  body: SecretRefBodySchema,
  response: z.object({ value: z.string().nullable() }),
});

export const secretsSet = defineEndpoint({
  route: "POST /api/secrets/set",
  body: SecretSetBodySchema,
});

export const secretsDelete = defineEndpoint({
  route: "POST /api/secrets/delete",
  body: SecretRefBodySchema,
});

export const secretsHas = defineEndpoint({
  route: "POST /api/secrets/has",
  body: SecretRefBodySchema,
  response: z.object({ has: z.boolean() }),
});

export const secretsMeta = defineEndpoint({
  route: "POST /api/secrets/meta",
  body: SecretRefBodySchema,
  response: z.object({
    set: z.boolean(),
    updatedAt: z.number().optional(),
  }),
});

export const secretsList = defineEndpoint({
  route: "POST /api/secrets/list",
  body: SecretListBodySchema,
  response: z.object({ keys: z.array(z.string()) }),
});
