import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { _crashes } from "./tables";

export const CrashSchema = createSelectSchema(_crashes, {
  firstSeenAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Crash = z.infer<typeof CrashSchema>;
