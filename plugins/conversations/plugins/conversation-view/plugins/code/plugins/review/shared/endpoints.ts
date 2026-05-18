import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// --- Body schemas ---

export const CreateReviewSectionBodySchema = z.object({
  name: z.string().min(1),
  patterns: z.array(z.string()),
});
export type CreateReviewSectionBody = z.infer<typeof CreateReviewSectionBodySchema>;

export const UpdateReviewSectionBodySchema = z.object({
  name: z.string().optional(),
  patterns: z.array(z.string()).optional(),
});
export type UpdateReviewSectionBody = z.infer<typeof UpdateReviewSectionBodySchema>;

// --- Endpoint definitions ---

export const listReviewSections = defineEndpoint({
  route: "GET /api/review-sections",
});

export const createReviewSection = defineEndpoint({
  route: "POST /api/review-sections",
  body: CreateReviewSectionBodySchema,
});

export const updateReviewSection = defineEndpoint({
  route: "PATCH /api/review-sections/:id",
  body: UpdateReviewSectionBodySchema,
});

export const deleteReviewSection = defineEndpoint({
  route: "DELETE /api/review-sections/:id",
});
