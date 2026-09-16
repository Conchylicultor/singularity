import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import {
  HooktheoryApiError,
  HooktheoryNotSignedInError,
  HooktheoryProviderUnavailableError,
  HooktheorySectionNotFoundError,
  TheorytabSectionIdSchema,
  theorytabSectionEndpoint,
  trendNodesEndpoint,
  trendSongsEndpoint,
} from "../../core";
import { getTheorytabSection, getTrendNodes, getTrendSongs } from "./client";

/**
 * Run one client call, turning the Hooktheory failures a caller can act on into
 * HTTP statuses: no account → 409 (sign in first), unknown section → 404,
 * Hooktheory's own refusal → 502 with its message. Anything else is our bug and
 * propagates as a 500.
 */
async function withHttpStatus<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof HooktheoryNotSignedInError) {
      throw new HttpError(409, err.message);
    }
    // 503: the deploy cannot serve this yet, and no user action fixes it.
    if (err instanceof HooktheoryProviderUnavailableError) {
      throw new HttpError(503, err.message);
    }
    if (err instanceof HooktheorySectionNotFoundError) {
      throw new HttpError(404, err.message);
    }
    if (err instanceof HooktheoryApiError) {
      throw new HttpError(502, err.message);
    }
    throw err;
  }
}

export const handleTrendNodes = implement(trendNodesEndpoint, ({ query }) =>
  withHttpStatus(() => getTrendNodes(query.cp?.split(",") ?? [])),
);

export const handleTrendSongs = implement(trendSongsEndpoint, ({ query }) =>
  withHttpStatus(() => getTrendSongs(query.cp.split(","), query.page)),
);

export const handleTheorytabSection = implement(
  theorytabSectionEndpoint,
  ({ params }) => {
    const id = TheorytabSectionIdSchema.safeParse(params.id);
    if (!id.success) {
      throw new HttpError(400, `Not a TheoryTab section id: ${params.id}`);
    }
    return withHttpStatus(() => getTheorytabSection(id.data));
  },
);
