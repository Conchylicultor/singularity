import { z } from "zod";

// The wire shape of `GET /api/front/visits`, as the site actually serves it.
//
// `date` is `.optional()` because it genuinely is: one live row (id 1394,
// "Bourse de Commerce") carries no `date` key at all. That is not a defensive
// guess — it is the observed contract, and the difference between "no date
// published" and "a date we could not read" is exactly what keeps this source
// type from emptying itself on a format change. See `extract.ts`.

export const VisitRowSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  date: z.string().optional(),
  location: z.string().optional(),
  picture: z.string().optional(),
  url: z.string(),
  city: z.number().int().optional(),
  kind: z.number().int().optional(),
});

export type VisitRow = z.infer<typeof VisitRowSchema>;

/**
 * One page of the listing. `done` is the site's own end-of-list signal and the
 * only thing that says we have the whole set — which is why `probe` treats
 * running out of pages without it as a failure rather than a shorter answer.
 */
export const VisitPageSchema = z.object({
  visits: z.array(VisitRowSchema),
  done: z.boolean(),
  /**
   * Coerced: the site echoes the query parameter back verbatim, so this arrives
   * as the STRING `"1"` and a strict `z.number()` rejects every page. Nothing
   * here reads it — `done` is what ends the loop — but it stays in the schema so
   * a shape change is still loud.
   */
  page: z.coerce.number().int(),
});
