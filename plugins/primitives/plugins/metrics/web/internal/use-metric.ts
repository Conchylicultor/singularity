import { useMemo } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  mapResource,
  useEndpointResource,
  useInfiniteQueryResource,
  useQueryResource,
  type PagedResourceResult,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { useLive } from "@plugins/network/plugins/live/web";
import {
  metricRevision,
  type Catalog,
  type DetailsQuery,
  type DrillPage,
  type MetricQuery,
  type MetricResult,
} from "../../core";
import {
  getMetricCatalog,
  metricDetails,
  queryMetric,
} from "../../shared/endpoints";

/** The served catalog: every source, metric and breakdown. Fixed per boot. */
export function useMetricCatalog(): ResourceResult<Catalog> {
  return useEndpointResource(getMetricCatalog, {}, { staleTime: Infinity });
}

/**
 * The source's revision, as the read every metric query is keyed by: a change
 * the source announces moves it, and every query keyed by it refetches — no
 * polling. The queries take it as their dependency, so while it is not known
 * yet they are loading (never an empty answer), a revision that failed before
 * ever landing is their failure too, and one that failed after landing keys
 * them by the last revision it had.
 */
function useSourceRev(source: string): ResourceResult<string> {
  const rev = useLive(metricRevision, { sourceId: source });
  return useMemo(() => mapResource(rev, (r) => r.rev), [rev]);
}

/**
 * One metric (or breakdown) query. `source` is the metric's source id — its
 * revision keys the query, so a change there refetches it. A POST (the query
 * is a structured body), so a query over `fetchEndpoint`, read as a
 * `ResourceResult`.
 */
export function useMetric(
  source: string,
  query: MetricQuery,
): ResourceResult<MetricResult> {
  const rev = useSourceRev(source);
  const same = JSON.stringify(query);
  return useQueryResource(rev, (r) => ({
    queryKey: ["metrics", "query", source, r, query],
    queryFn: ({ signal }) =>
      fetchEndpoint(queryMetric, {}, { body: query, signal }),
    staleTime: Infinity,
    // A new revision is the same question with fresher numbers: keep the last
    // answer on screen while it loads. A changed query (a new range, a split)
    // is a different question, and shows its own loading state.
    placeholderData: (prev, prevQuery) =>
      prevQuery !== undefined && JSON.stringify(prevQuery.queryKey[4]) === same
        ? prev
        : undefined,
    refetchOnWindowFocus: false,
    retry: false,
  }));
}

/** The first page a drawer shows before "Show all". */
const DETAILS_PREVIEW = 5;
const DETAILS_PAGE = 50;

/**
 * The records behind one bucket (optionally one split key), paged by the
 * server's cursor: a preview page of `DETAILS_PREVIEW`, then pages of 50 on
 * `loadMore`.
 */
export function useMetricDetails(
  source: string,
  query: Omit<DetailsQuery, "cursor" | "limit">,
): PagedResourceResult<DrillPage> {
  const rev = useSourceRev(source);
  return useInfiniteQueryResource(rev, (r) => ({
    queryKey: ["metrics", "details", source, r, query],
    queryFn: ({
      pageParam,
      signal,
    }: {
      pageParam: string | null;
      signal: AbortSignal;
    }) =>
      fetchEndpoint(
        metricDetails,
        {},
        {
          body: {
            ...query,
            cursor: pageParam,
            limit: pageParam === null ? DETAILS_PREVIEW : DETAILS_PAGE,
          },
          signal,
        },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: DrillPage) => last.nextCursor ?? undefined,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  }));
}
