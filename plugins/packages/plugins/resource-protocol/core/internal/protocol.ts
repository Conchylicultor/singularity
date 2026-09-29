// The live-resource wire protocol's FAILURE vocabulary — one definition both
// ends compile against. The resource runtime (per-worktree server and central)
// sends these frames and bodies; the live-state client reads them. A leaf on
// purpose: the runtime barrel pulls `node:crypto`, so the browser cannot import
// it, and the runtime must not import the live-state client.

/** Params as they ride the wire: every name → a string. */
type WireParams = Record<string, string>;

/**
 * Why a subscription (or its HTTP read) was refused.
 *
 * - `unknown-key` — no resource is registered under the key.
 * - `unauthorized` — the resource's `authorize` seam refused it.
 * - `loader-failed` — the loader threw: a server-side failure.
 * - `contract-mismatch` — the params do not match the resource's declaration
 *   (a required param missing, an unknown one, a non-canonical encoding). The
 *   read is refused before it registers, so no push reruns it.
 */
export type SubErrorReason =
  "unknown-key" | "unauthorized" | "loader-failed" | "contract-mismatch";

/**
 * Whose fault a contract mismatch is, judged from the build the client says it
 * runs against the build the server serves (`contractVerdict`):
 *
 * - `skew` — the tab runs a different bundle than the server: it is out of date,
 *   and a reload fixes it. Expected after every deploy that changes a contract.
 * - `same-build` — both run the same bundle: the client's own encoding fails
 *   the server's decode. A real bug.
 * - `unknown` — one side cannot say (a dev bundle, no served graph, central).
 */
export type ContractVerdict = "skew" | "same-build" | "unknown";

/** The `sub-error` frame the runtime sends when it refuses (or drops) a sub. */
export interface SubErrorFrame {
  kind: "sub-error";
  id?: number;
  key: string;
  params: WireParams;
  reason: SubErrorReason;
  /** Present on `contract-mismatch` and `unknown-key` — both are what skew looks like. */
  verdict?: ContractVerdict;
}

/**
 * The JSON body of a failed `GET /api/resources/:key` (404 unknown key, 409
 * contract mismatch, 500 loader failure), so the client's error carries a
 * typed reason instead of a bare status.
 */
export interface ResourceHttpErrorBody {
  reason: SubErrorReason;
  verdict?: ContractVerdict;
  detail?: string;
}

/**
 * The request header an HTTP resource read names the client's build graph in —
 * the HTTP twin of a `sub` frame's `build` field.
 */
export const BUILD_GRAPH_HEADER = "x-singularity-build-graph";

/** The build a bundle names when it was not built with a graph hash (a dev server). */
export const DEV_BUILD = "dev";

/**
 * The params a subscription named do not match the resource's declaration.
 * Thrown by the params DECODE paths (a subscription's wire params), never by a
 * declaration or an encode — those are programmer errors and stay plain
 * `Error`s that crash loudly. The runtime turns this into `contract-mismatch`.
 */
export class ResourceContractError extends Error {
  constructor(
    public readonly key: string,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = "ResourceContractError";
  }
}

/**
 * Judge a contract mismatch: `clientBuild` is the graph the client said it runs
 * (absent from a bundle that predates the field), `serverGraph` the graph this
 * server serves (`null` when unknown).
 *
 * | client build              | verdict      |
 * |---------------------------|--------------|
 * | absent (pre-feature)      | `skew`       |
 * | `"dev"`, or server unknown| `unknown`    |
 * | differs from server       | `skew`       |
 * | equal                     | `same-build` |
 *
 * An absent build is skew because only a bundle older than this protocol sends
 * none — which is exactly the tab that is out of date.
 */
export function contractVerdict(
  clientBuild: string | undefined,
  serverGraph: string | null,
): ContractVerdict {
  if (clientBuild === undefined) return "skew";
  if (clientBuild === DEV_BUILD || serverGraph === null) return "unknown";
  return clientBuild === serverGraph ? "same-build" : "skew";
}

const REASONS: ReadonlySet<string> = new Set<SubErrorReason>([
  "unknown-key",
  "unauthorized",
  "loader-failed",
  "contract-mismatch",
]);
const VERDICTS: ReadonlySet<string> = new Set<ContractVerdict>([
  "skew",
  "same-build",
  "unknown",
]);

/**
 * Read a failed HTTP read's body as a `ResourceHttpErrorBody`, or `undefined`
 * when it is not one (a proxy's HTML error page, an older server's plain text).
 */
export function parseResourceHttpErrorBody(
  raw: unknown,
): ResourceHttpErrorBody | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { reason, verdict, detail } = raw as Record<string, unknown>;
  if (typeof reason !== "string" || !REASONS.has(reason)) return undefined;
  return {
    reason: reason as SubErrorReason,
    ...(typeof verdict === "string" && VERDICTS.has(verdict)
      ? { verdict: verdict as ContractVerdict }
      : {}),
    ...(typeof detail === "string" ? { detail } : {}),
  };
}
