export { reviewConfig } from "./config";
export { reviewSectionsResource } from "./resources";
export type { ReviewSection } from "./resources";
export {
  listReviewSections,
  createReviewSection,
  updateReviewSection,
  deleteReviewSection,
  CreateReviewSectionBodySchema,
  UpdateReviewSectionBodySchema,
} from "./endpoints";
export type { CreateReviewSectionBody, UpdateReviewSectionBody } from "./endpoints";
