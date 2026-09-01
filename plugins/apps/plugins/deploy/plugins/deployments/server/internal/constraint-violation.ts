import { HttpError } from "@plugins/infra/plugins/endpoints/server";

// The invariants live in `tables.ts` as DB constraints, so the write itself is
// the arbiter — a pre-flight SELECT would give the same answer most of the time
// and the wrong one under a concurrent write. This maps each violation back to a
// message naming the invariant, so "the DB rejected it" is never what a caller
// sees.
const COMPOSITION_SERVER_UQ = "deploy_deployments_composition_server_uq";
const SERVER_PORT_UQ = "deploy_deployments_server_port_uq";

/** node-postgres surfaces these as SQLSTATEs plus the offending constraint. */
const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";

/**
 * Did this write fail against that exact unique index?
 *
 * Shared rather than re-spelled, because the run ledger contends on one too —
 * `deploy_runs_server_inflight_uq`, the claiming INSERT that IS the per-server
 * exclusivity lock (see `run-state.ts`). Same SQLSTATE, same reasoning: the
 * write is the arbiter, so the only question left is which invariant it hit.
 */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const pg = err as { code?: string; constraint?: string } | null;
  return pg?.code === UNIQUE_VIOLATION && pg.constraint === constraint;
}

/**
 * Rethrow a write failure as the HTTP verdict it actually is. Anything this does
 * not recognise is rethrown untouched — an unmapped DB error must stay a loud
 * 500, not become a plausible-looking 409.
 */
export function rethrowConstraintViolation(
  err: unknown,
  ctx: { loopbackPort?: number },
): never {
  const pg = err as { code?: string; constraint?: string } | null;
  if (pg?.code === UNIQUE_VIOLATION) {
    if (isUniqueViolation(err, COMPOSITION_SERVER_UQ)) {
      throw new HttpError(
        409,
        "This server already has a deployment of that composition. There is one " +
          "install of a composition per server — deploy it to another server, or " +
          "edit the existing deployment.",
      );
    }
    if (isUniqueViolation(err, SERVER_PORT_UQ)) {
      throw new HttpError(
        409,
        ctx.loopbackPort === undefined
          ? "That loopback port is already taken by another deployment on this server."
          : `Port ${ctx.loopbackPort} is already taken by another deployment on this server.`,
      );
    }
  }
  if (pg?.code === FK_VIOLATION) {
    // The only FK on the table. A deployment against an unregistered server is
    // the caller's mistake, not a server fault.
    throw new HttpError(
      400,
      "No such server — register it in the Deploy app first.",
    );
  }
  throw err;
}
