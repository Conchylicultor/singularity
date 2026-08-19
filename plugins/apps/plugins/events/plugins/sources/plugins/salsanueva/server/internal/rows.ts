import { z } from "zod";

// The wire shape of `GET /wp-json/v1/blb/courses`, as the school actually serves
// it: one object per DATED OCCURRENCE of a course, not one per course.
//
// `.optional()` appears only where the live API genuinely omits a key — an
// absent `coachs` on a course with no teacher named yet, an absent `data` on a
// window with no courses at all. Everything the extractor reads to build an
// event's identity is required, so a shape change parks the source instead of
// quietly reshaping what it publishes.

export const CoachSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  photo: z.string().optional(),
  profile: z.string().optional(),
});

export const LocationSchema = z.object({
  /** The studio, e.g. `SalsaNueva 20è`. The `location_name` filter's value. */
  name: z.string(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  color: z.string().optional(),
});

export const CourseRowSchema = z.object({
  /** ISO instant carrying the school's own UTC offset, e.g. `2026-08-31T19:00:00+0200`. */
  start: z.string(),
  /** `Adulte` / `Enfant`. */
  type: z.string(),
  activity: z.string(),
  sub_activity: z.string(),
  course_level: z.string(),
  /** Local calendar day, `YYYY-MM-DD`. Redundant with `start`, and the school's own key. */
  course_date: z.string(),
  /** Local wall clock, `HH:MM`. */
  course_start: z.string(),
  course_end: z.string().optional(),
  /** Minutes. */
  course_duration: z.number().int().positive(),
  /** The studio room. One course keeps one room, so it is part of a series' identity. */
  classroom: z.string(),
  location: LocationSchema,
  coachs: z.array(CoachSchema).optional(),
  /** Marketing copy, HTML, shared by every occurrence of a course. */
  description: z.string().optional(),
  image: z.string().optional(),
  /** Per-occurrence booking link, so deliberately NOT what a series publishes. */
  course_purchase: z.string().optional(),
  course_schedule_id: z.number().int().optional(),
  classroom_id: z.number().int().optional(),
});

export type CourseRow = z.infer<typeof CourseRowSchema>;

/**
 * The envelope.
 *
 * `data` is optional because a window the schedule does not cover comes back as
 * `{"success":true,"code":"schedules_found"}` with no `data` key at all — the
 * honest "no courses", and NOT an error. `success`/`code` are kept in the schema
 * so a shape change is still loud even though nothing reads them.
 */
export const CoursesResponseSchema = z.object({
  success: z.boolean(),
  code: z.string(),
  data: z.array(CourseRowSchema).optional(),
});
