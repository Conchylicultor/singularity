import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { _reports } from "./tables";

export const ReportSchema = createSelectSchema(_reports, {
  firstSeenAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Report = z.infer<typeof ReportSchema>;
