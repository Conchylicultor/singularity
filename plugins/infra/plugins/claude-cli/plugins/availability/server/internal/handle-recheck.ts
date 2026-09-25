import { implement } from "@plugins/infra/plugins/endpoints/server";
import { recheckClaudeCode } from "../../core";
import { recheckClaudeCodeNow } from "./status";

export const handleRecheck = implement(recheckClaudeCode, () =>
  recheckClaudeCodeNow(),
);
