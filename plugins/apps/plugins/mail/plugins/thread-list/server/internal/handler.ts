import { implement } from "@plugins/infra/plugins/endpoints/server";
import { queryThreadsEndpoint } from "../../core";
import { queryThreads } from "./query";

// Windowed thread page for a mailbox view. Thin adapter: decode → `queryThreads`
// (which owns the account resolution, view→SQL compile, and keyset seek).
export const handleQueryThreads = implement(queryThreadsEndpoint, ({ body }) =>
  queryThreads(body),
);
