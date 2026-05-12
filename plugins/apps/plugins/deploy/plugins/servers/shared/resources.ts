import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { ServerSchema, type Server } from "./schemas";

export const serversResource = resourceDescriptor<Server[]>(
  "deploy.servers",
  z.array(ServerSchema),
  [],
);
