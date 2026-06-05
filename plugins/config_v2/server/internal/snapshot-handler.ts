import { implement } from "@plugins/infra/plugins/endpoints/core";
import { configSnapshot } from "../../core";
import { getConfigSnapshot } from "./resource";

export const handleConfigSnapshot = implement(configSnapshot, () => getConfigSnapshot());
