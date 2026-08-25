import { uuid } from "drizzle-orm/pg-core";
import type { StorageColumnFor } from "@plugins/fields/plugins/server-capabilities/server";

export const build = (name: string): StorageColumnFor<string> => uuid(name);
