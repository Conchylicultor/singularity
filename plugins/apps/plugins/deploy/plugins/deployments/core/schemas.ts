import { z } from "zod";

/**
 * One deployment: *where a composition is served, and under what URL.*
 *
 * Every field is an operational placement fact, never a property of the
 * software — which is why none of this lives in git. `hostnames` because the
 * same composition can be served at many URLs on many surfaces; `loopbackPort`
 * because it is a property of the box it lands on. The composition itself IS the
 * software, and stays in the `compositions` config.
 *
 * What is deliberately ABSENT is as load-bearing as what is here. The run user,
 * install dir, systemd unit and Caddy site are all derived from `compositionId`
 * (see `./derive.ts`), and the platform is read off the server's health probe —
 * `deploy_servers_ext_health.platform`, discovered rather than declared, so
 * moving to an ARM box is not a code change. Nothing about the install is
 * stored; converge writes it and re-running converge is the only way it changes.
 *
 * There is no id of its own below the URL either: `(compositionId, serverId)` is
 * unique, so the composition name is the single identity threading the install
 * dir, the unit, the runtime namespace and the database.
 */
export const DeploymentSchema = z.object({
  id: z.string(),
  /**
   * A composition NAME from the `compositions` config — validated at write time
   * by the create/update handler, not by a repo check: the row is runtime data,
   * so a stale name must fail loudly when someone saves it.
   *
   * The name (not the config item's uuid) because it is what `release
   * --composition <name>` takes, what lands in `RELEASE.json.composition`, and
   * what the launcher makes the runtime namespace — so it is the one string the
   * derived install names must agree with.
   */
  compositionId: z.string(),
  /** FK → `deploy_servers.id`. Cascades on server delete. */
  serverId: z.string(),
  /** Public hostnames Caddy serves this deployment on. May be empty. */
  hostnames: z.array(z.string()),
  /** The loopback port the gateway binds; Caddy proxies to it. */
  loopbackPort: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;
