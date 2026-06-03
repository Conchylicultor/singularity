import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { BacklinkRowSchema } from "./schemas";
import type { BacklinkRow } from "./schemas";

// Parameterized by the target page id. Lists the pages that link TO `pageId`.
export const backlinksResource = resourceDescriptor<BacklinkRow[], { pageId: string }>(
  "page-backlinks",
  z.array(BacklinkRowSchema),
  [],
);
