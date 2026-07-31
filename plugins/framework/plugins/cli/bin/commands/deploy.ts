/**
 * `./singularity deploy converge|ship` — the two verbs over a deployment.
 *
 * **converge** makes a host serve a composition: run user, dir layout, the
 * `env` EnvironmentFile, Caddy, the systemd unit, the firewall.
 * **ship** puts a bundle on it and activates it behind a health gate.
 *
 * Design: `research/2026-07-29-global-composition-production-deployment.md`
 * (D3 + D4). Three properties of that design shape this file:
 *
 * - **Nothing about the install is authored.** Every path, user and unit name
 *   comes from `deriveInstall` (`deployments/core/derive.ts`); a path spelled
 *   twice is a path that eventually disagrees with itself. The unit *template*
 *   is `deriveInstall(SYSTEMD_INSTANCE)` — the same function of `"%i"` — so
 *   the template and the real instance's paths cannot drift.
 * - **Converge is one generated script, not a checked-in `bootstrap.sh`.** It
 *   is a pure function of the deployment row, uploaded and run as the server's
 *   LOGIN user (root — it creates users and writes `/etc`); the run user is a
 *   different, unprivileged, derived one, and that split is the whole point.
 *   There is no file on the box a human is expected to edit.
 * - **Refusals come before any host mutation**, each named. A server we have
 *   never reached, a non-Debian host, a composition carrying owner data behind
 *   a public hostname, or a closure needing `infra/secrets` are all refused by
 *   name rather than compared against a null.
 *
 * ### Where the CLI reads its inputs, and why the two transports differ
 *
 * - The **deployment record** goes over HTTP to this checkout's own backend,
 *   through the endpoint contracts the plugin publishes in `core/` *for this
 *   consumer*. That keeps `assertKnownComposition`, the hostname/port
 *   validation and the unique-constraint → 409 mapping as the single writer of
 *   that table. (It is also the only option: the deployments *server* barrel
 *   eagerly imports `config_v2/server`, which throws at module eval without
 *   `SINGULARITY_WORKTREE` — so a CLI process cannot import its table.)
 * - The **server row + its health row** are read straight from the DB, because
 *   they have no core-level wire contract: `servers`/`health` keep theirs in
 *   plugin-private `shared/`, and the TOFU-pinned `hostKeyLine` is
 *   deliberately withheld from the wire. The CLI needs that pin — connecting
 *   with `hostKey: { mode: "learn" }` would silently accept a changed host key,
 *   i.e. weaker verification than the probe already established.
 *
 * Both resolve against `currentWorktreeName()`, so the CLI acts on exactly the
 * namespace whose Deploy app you are looking at: bare on a checkout that is
 * `main`, or the spawning backend's own worktree when the D5 UI shells out.
 */
import type { Command } from "commander";
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { eq, or } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  REPO_ROOT,
  SINGULARITY_DIR,
  currentWorktreeName,
} from "@plugins/infra/plugins/paths/server";
import { openShortLivedClient } from "@plugins/database/plugins/admin/server";
import {
  _deployServers,
  getServerSshPrivateKey,
} from "@plugins/apps/plugins/deploy/plugins/servers/server";
import { serverHealth } from "@plugins/apps/plugins/deploy/plugins/health/server";
import {
  CADDY_SITES_DIR,
  DEFAULT_LOOPBACK_PORT,
  DeploymentSchema,
  INSTALL_ROOT,
  REMOTE_SCRIPT_SHEBANG,
  SYSTEMD_INSTANCE,
  UNIT_TEMPLATE_PATH,
  createDeployment,
  currentAppPath,
  deriveInstall,
  listDeployments,
  listenAddress,
  releaseAppPath,
  releaseDir,
  type Deployment,
  type InstallLayout,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import { sshRun, sshUpload, type SshTarget } from "@plugins/infra/plugins/ssh/server";
import { isLinuxTag, isPlatformTag, type PlatformTag } from "@plugins/release/core";
import {
  classifyEdges,
  expandEntrySeeds,
  flattenManifest,
  resolveComposition,
} from "@plugins/plugin-meta/plugins/closure/core";
import type { CompositionManifest, EdgeGraph } from "@plugins/plugin-meta/plugins/closure/core";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  compositionsConfig,
  manifestItemToManifest,
  type CompositionManifestItem,
} from "@plugins/plugin-meta/plugins/composition/core";
import {
  assertCompositionName,
  readEffectiveConfigFromDisk,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { extractMethod, extractPath } from "@plugins/infra/plugins/endpoints/core";

// ── Budgets ───────────────────────────────────────────────────────────────────
//
// `sshRun`'s 15s default is a reachability probe's budget. Each of these is a
// bound on a DIFFERENT external wait, so they are separate constants rather
// than one shared "ssh timeout": the dial itself stays tightly bounded inside
// the ssh primitive regardless, so a dead host still fails fast under any of
// them.

/** A single short remote command (mkdir, readlink, curl one URL). */
const SSH_SHORT_MS = 30_000;
/** The whole converge script: `apt-get update` + a Caddy install on a cold box. */
const CONVERGE_MS = 15 * 60_000;
/** One ~100MB+ bundle over a domestic uplink. */
const UPLOAD_MS = 30 * 60_000;
/**
 * The activate script, INCLUDING the health gate below — so this must exceed
 * `READY_ATTEMPTS × READY_INTERVAL_SEC` (a bundle's first run extracts ~200MB
 * and initdb's a Postgres cluster) or the ssh deadline would kill the script
 * mid-gate, i.e. after the flip and before the revert.
 */
const ACTIVATE_MS = 20 * 60_000;

/** Health-gate bound: attempts × interval is the whole "not up yet" window. */
const READY_ATTEMPTS = 150;
const READY_INTERVAL_SEC = 4;

/**
 * The composition names whose bundles carry the OWNER's own data. A deployment
 * with a public hostname may not converge if the composition's closure reaches
 * any of them: converge is the moment a composition becomes internet-reachable,
 * and `agent-manager` on the open internet is conversations, tasks and secrets
 * with no auth in front. Ordinary compositions in the `compositions` config, so
 * what counts as owner data stays editable data rather than a list in code.
 */
const OWNER_DATA_BUNDLES = ["agent-runtime", "auth", "conversations", "tasks-domain"];

/**
 * The secrets store is hosted on the CENTRAL runtime, which a released bundle
 * does not have — so a composition that genuinely needs a credential is broken
 * in a way the `env` file cannot fix, and converge refuses rather than writing
 * plaintext credentials onto a box under a scheme nobody reviewed. See the plan,
 * §What goes in `env`.
 */
const SECRETS_PLUGIN_ID = asPluginId("infra.secrets");

/** The `compositions` config's owning plugin — where its jsonc files live. */
const COMPOSITIONS_HIERARCHY_PATH = asPath(asPluginId("plugin-meta.composition"));

/**
 * A named refusal: the user's problem, stated once, with no stack trace. Every
 * guard in this file exits through here, so "the command refused" and "the
 * command crashed" stay visibly different things.
 */
function refuse(message: string): never {
  console.error(`deploy: ${message}`);
  process.exit(1);
}

// ── Resolution ────────────────────────────────────────────────────────────────

type ServerRow = typeof _deployServers.$inferSelect;

/** Everything both verbs need, resolved once, with every refusal already made. */
interface DeployTarget {
  deployment: Deployment;
  server: ServerRow;
  /** DISCOVERED by the health probe — never a flag, never a stored field. */
  platform: PlatformTag;
  install: InstallLayout;
  privateKey: string;
  /** TOFU-pinned `known_hosts` line from the last successful probe. */
  knownHostsLine: string;
}

/** One short-lived pool against this namespace's DB, released in `finally`. */
async function withDb<T>(fn: (db: NodePgDatabase) => Promise<T>): Promise<T> {
  const pool = openShortLivedClient(currentWorktreeName());
  try {
    return await fn(drizzle(pool));
  } finally {
    await pool.end();
  }
}

/** This namespace's own backend, through the gateway. */
function backendBase(): string {
  return `http://${currentWorktreeName()}.localhost:9000`;
}

/**
 * Call one of the deployments endpoints on this namespace's backend.
 *
 * The method and path come off the endpoint definition rather than being
 * written here, so the CLI cannot drift from the contract it consumes. A
 * non-2xx carries the server's own message through verbatim — those messages
 * (unknown composition, duplicate deployment, port taken) are the validation
 * this transport exists to keep as the single writer.
 */
async function callEndpoint(
  endpoint: { route: string },
  body?: unknown,
): Promise<unknown> {
  const url = `${backendBase()}${extractPath(endpoint.route)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: extractMethod(endpoint.route),
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    return refuse(
      `cannot reach ${url} — the "${currentWorktreeName()}" backend is not serving. ` +
        `Run \`./singularity build\` first; deploy reads its deployment records from it.`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return refuse(`${extractMethod(endpoint.route)} ${url} → ${res.status}: ${text}`);
  }
  return await res.json();
}

/**
 * The deployment row for `(composition, server)`, created with defaults when
 * absent — via the endpoint, so the composition name is validated and the two
 * unique constraints are enforced by the DB that owns them.
 */
async function ensureDeployment(
  compositionId: string,
  serverId: string,
): Promise<Deployment> {
  const existing = DeploymentSchema.array()
    .parse(await callEndpoint(listDeployments))
    .find((d) => d.compositionId === compositionId && d.serverId === serverId);
  if (existing) return existing;

  console.log(
    `  • no deployment for "${compositionId}" on this server — creating one ` +
      `(no hostnames, loopback port ${DEFAULT_LOOPBACK_PORT})`,
  );
  return DeploymentSchema.parse(
    await callEndpoint(createDeployment, { compositionId, serverId }),
  );
}

/**
 * Resolve `--server` to one registered server. Documented as an id because that
 * is the identity, but a NAME is accepted too: ids are uuids nobody types.
 * Ambiguity is a refusal, never a silent first-match.
 */
async function resolveServer(db: NodePgDatabase, ref: string): Promise<ServerRow> {
  const rows = await db
    .select()
    .from(_deployServers)
    .where(or(eq(_deployServers.id, ref), eq(_deployServers.name, ref)));
  if (rows.length === 1) return rows[0]!;
  if (rows.length > 1) {
    refuse(
      `"${ref}" matches ${rows.length} servers (${rows.map((r) => r.id).join(", ")}) — pass the id.`,
    );
  }
  const all = await db.select().from(_deployServers);
  refuse(
    all.length === 0
      ? `no servers are registered in the "${currentWorktreeName()}" namespace. Add one in the Deploy app first.`
      : `no server matches "${ref}". Registered: ${all
          .map((r) => `${r.name} (${r.id})`)
          .join(", ")}`,
  );
}

/**
 * The platform, read off the server's health row — the four states of
 * `(ok, platform)` become four distinct refusals rather than one null check.
 * "Never probed" is a real state: it means we have never reached this box.
 */
function requirePlatform(
  server: ServerRow,
  health: typeof serverHealth.table.$inferSelect | undefined,
): PlatformTag {
  if (!health) {
    refuse(
      `server "${server.name}" has never been verified — run "Verify connection" on it in ` +
        `the Deploy app first. The platform a deploy needs is discovered by that probe.`,
    );
  }
  if (!health.ok) {
    refuse(
      `server "${server.name}" failed its last reachability check ` +
        `(${health.failureKind ?? "unknown"}: ${health.failureMessage ?? "no message"}). ` +
        `Fix it and run "Verify connection" again.`,
    );
  }
  if (health.platform === null) {
    refuse(
      `server "${server.name}" is reachable but reported a platform no release targets. ` +
        `Deploy supports only the platforms a bundle can be built for.`,
    );
  }
  if (!isPlatformTag(health.platform)) {
    refuse(
      `server "${server.name}" has an unrecognised recorded platform "${health.platform}" — ` +
        `run "Verify connection" again to refresh it.`,
    );
  }
  return health.platform;
}

async function resolveTarget(opts: {
  composition: string;
  serverRef: string;
}): Promise<DeployTarget> {
  // The composition name becomes a unix user, a path segment, a systemd
  // instance and part of every remote path this file interpolates into a shell
  // script — so its shape is asserted with the canonical helper BEFORE it is
  // used anywhere, not trusted because a config held it.
  try {
    assertCompositionName(opts.composition);
  } catch (err) {
    refuse(err instanceof Error ? err.message : String(err));
  }

  const { server, health } = await withDb(async (db) => {
    const found = await resolveServer(db, opts.serverRef);
    const [row] = await db
      .select()
      .from(serverHealth.table)
      .where(eq(serverHealth.table.parentId, found.id));
    return { server: found, health: row };
  });

  const platform = requirePlatform(server, health);
  // A pin is what makes "this key reached THIS host" a fact; a successful probe
  // always learns one, so a missing pin is a state to fix, not to fall back on.
  if (health?.hostKeyLine == null) {
    refuse(
      `server "${server.name}" has no pinned SSH host key — run "Verify connection" again. ` +
        `Deploy will not connect with trust-on-first-use.`,
    );
  }

  const secret = await getServerSshPrivateKey(server.id);
  if (!secret.configured) {
    refuse(
      `no SSH key is configured for server "${server.name}" — generate one in the Deploy app first.`,
    );
  }

  const deployment = await ensureDeployment(opts.composition, server.id);
  return {
    deployment,
    server,
    platform,
    install: deriveInstall(opts.composition),
    privateKey: secret.privateKey,
    knownHostsLine: health.hostKeyLine,
  };
}

/** An `SshTarget` for this deployment, with the budget for ONE operation. */
function sshTargetFor(target: DeployTarget, timeoutMs: number): SshTarget {
  return {
    host: target.server.host,
    port: target.server.port,
    user: target.server.sshUser,
    privateKey: target.privateKey,
    hostKey: { mode: "pinned", knownHostsLine: target.knownHostsLine },
    timeoutMs,
  };
}

/**
 * Run one remote command, refusing with OpenSSH's own diagnostic on failure.
 * Returns stdout so callers can read a value (`readlink`, `curl`) off it.
 */
async function remote(
  target: DeployTarget,
  command: string[],
  opts: { timeoutMs: number; what: string },
): Promise<string> {
  const result = await sshRun(sshTargetFor(target, opts.timeoutMs), command);
  if (!result.ok) {
    refuse(
      `${opts.what} failed on ${target.server.name} (${result.kind}): ${result.message}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

/**
 * Upload a generated script to `/tmp` and run it with `bash`.
 *
 * The script is left on the box deliberately: it is overwritten by the next
 * converge/ship (so it cannot go stale), `/tmp` is transient, and after a
 * failure it is the exact thing an operator wants to read. A cleanup pass would
 * have to either swallow its own failure or mask the real one.
 */
async function runScript(
  target: DeployTarget,
  opts: { script: string; remoteName: string; timeoutMs: number; what: string },
): Promise<void> {
  const localPath = join(tmpdir(), opts.remoteName);
  writeFileSync(localPath, opts.script, { mode: 0o700 });
  const remotePath = `/tmp/${opts.remoteName}`;

  const upload = await sshUpload(
    sshTargetFor(target, SSH_SHORT_MS),
    localPath,
    remotePath,
  );
  if (!upload.ok) {
    refuse(
      `uploading the ${opts.what} script to ${target.server.name} failed ` +
        `(${upload.kind}): ${upload.message}\n${upload.stderr}`,
    );
  }

  const result = await sshRun(sshTargetFor(target, opts.timeoutMs), [
    "bash",
    remotePath,
  ]);
  // Both scripts send ALL their progress to stderr (`exec 1>&2`), because
  // `sshRun`'s FAILURE result carries stderr only — on stdout the record of
  // what ran would be dropped on exactly the path where it matters most.
  if (result.ok) {
    if (result.stderr !== "") console.log(result.stderr.trimEnd());
    return;
  }
  refuse(
    `${opts.what} failed on ${target.server.name} (${result.kind}): ${result.message}\n` +
      `${result.stderr}\n(the script is left at ${remotePath} on the host)`,
  );
}

// ── Composition closure (converge's guards) ───────────────────────────────────

interface ClosureContext {
  graph: EdgeGraph;
  manifests: CompositionManifest[];
  items: CompositionManifestItem[];
}

/** Build the plugin tree + edge graph once, and read the live manifest set. */
async function loadClosureContext(): Promise<ClosureContext> {
  const values = readEffectiveConfigFromDisk(compositionsConfig, {
    root: REPO_ROOT,
    worktreeName: currentWorktreeName(),
    singularityDir: SINGULARITY_DIR,
    hierarchyPath: COMPOSITIONS_HIERARCHY_PATH,
  });
  const tree = await buildPluginTree(join(REPO_ROOT, "plugins"), {
    skipBarrelImport: true,
    facets: true,
  });
  return {
    graph: classifyEdges(tree),
    manifests: values.manifests.map(manifestItemToManifest),
    items: values.manifests,
  };
}

/**
 * A bundle's CONTAINMENT: the territory it declares (flattened entries, plus
 * each selected contributor and its subtree), NOT its hard deps. Same rule the
 * `composition-closure` check's `excludes` gate uses, so "carries owner data"
 * means the same thing at converge as it does at check time — using containment
 * keeps generic shared infra usable while the deep taproots listed as a
 * bundle's entries still catch transitive contamination.
 */
function containmentOf(target: CompositionManifest, ctx: ClosureContext): Set<PluginId> {
  const flat = flattenManifest(target, ctx.manifests);
  const containment = new Set<PluginId>(
    expandEntrySeeds(flat.entryPoints, ctx.graph).seeds,
  );
  for (const id of flat.selectedContributors) {
    containment.add(id);
    for (const descendant of ctx.graph.subtree.get(id) ?? []) containment.add(descendant);
  }
  return containment;
}

/**
 * The two closure refusals, evaluated BEFORE anything on the host is touched.
 *
 * Both read the composition's resolved hard closure, which is why they live
 * here rather than in `./singularity check`: hostnames are runtime data a repo
 * check cannot see, and the guard should fire when the exposure is actually
 * created rather than when unrelated code is compiled.
 */
async function assertClosureSafe(target: DeployTarget): Promise<void> {
  const composition = target.install.compositionId;
  const ctx = await loadClosureContext();
  const item = ctx.items.find((m) => m.name === composition);
  if (!item) {
    refuse(
      `"${composition}" is not a composition. Known: ${ctx.items
        .map((m) => m.name)
        .sort()
        .join(", ")}`,
    );
  }

  const flat = flattenManifest(manifestItemToManifest(item), ctx.manifests);
  const bundle = resolveComposition(ctx.graph, flat).bundle;
  console.log(`  • closure: ${bundle.size} plugins`);

  // 1. Secrets. Unconditional — a bundle with no central runtime cannot read a
  //    secret at all, so this is broken regardless of who can reach it.
  if (bundle.has(SECRETS_PLUGIN_ID)) {
    refuse(
      `composition "${composition}" needs ${SECRETS_PLUGIN_ID}, and converge writes no secrets.\n` +
        `The secrets store is hosted on the CENTRAL runtime, which a released bundle does not ` +
        `have — so this composition cannot work as a deployed install, and an env file cannot ` +
        `fix it. See research/2026-07-29-global-composition-production-deployment.md, ` +
        `§What goes in \`env\`.`,
    );
  }

  // 2. Public exposure. `exposure` is DERIVED, never declared: a deployment
  //    with a hostname behind an open 443 simply IS public, so there is no flag
  //    to typo.
  if (target.deployment.hostnames.length === 0) return;

  for (const name of OWNER_DATA_BUNDLES) {
    const owner = ctx.manifests.find((m) => m.name === name);
    if (!owner) {
      // Fail loud rather than pass a guard we could not evaluate.
      refuse(
        `cannot evaluate the public-exposure guard: composition "${name}" is not defined in ` +
          `the \`compositions\` config, so the owner-data territory it names cannot be resolved.`,
      );
    }
    const containment = containmentOf(owner, ctx);
    const offenders = [...bundle].filter((id) => containment.has(id)).sort();
    if (offenders.length > 0) {
      refuse(
        `refusing to expose composition "${composition}" on ${target.deployment.hostnames.join(
          ", ",
        )}: its closure includes ${offenders.length} plugin(s) from the "${name}" bundle, ` +
          `which carries the owner's own data (${offenders.slice(0, 8).join(", ")}${
            offenders.length > 8 ? ", …" : ""
          }).\n` +
          `Converge is the moment a composition becomes internet-reachable, and there is no auth ` +
          `in front of it. Remove the hostnames to serve it on loopback only, or deploy a ` +
          `composition that does not bundle owner data.`,
      );
    }
  }
}

// ── D3: the converge script ───────────────────────────────────────────────────

/** Shell single-quote one value for safe interpolation into the script. */
function sq(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * A hostname is about to be written into a Caddyfile, so it is asserted at the
 * injection site as well as at the door.
 *
 * The authority on hostname SHAPE is the create/update endpoint's
 * `HostnameSchema` (a real DNS-label regex); this is the narrower assertion
 * that a value cannot escape a Caddyfile token — deliberately not a second copy
 * of that spec, which would be a second place to keep it right.
 */
function assertCaddySafeHostname(hostname: string): void {
  if (!/^[a-z0-9.*-]{1,253}$/.test(hostname)) {
    refuse(
      `deployment hostname "${hostname}" is not a plain DNS hostname and will not be written ` +
        `into a Caddy site block. Fix it in the Deploy app.`,
    );
  }
}

/**
 * The systemd unit — ONE template file for every composition, so nothing
 * per-instance may appear in it. Its paths are `deriveInstall("%i")`, the same
 * function that derives the real instance's paths.
 *
 * `EQUIN_RELEASE_DIR` is explicit because `PrivateTmp=yes` gives the service its
 * own `/tmp`: without it the self-extractor falls back to `tmpdir()` and
 * re-extracts the whole bundle on every boot.
 */
function unitTemplate(): string {
  const t = deriveInstall(SYSTEMD_INSTANCE);
  return `[Unit]
Description=equin composition ${SYSTEMD_INSTANCE}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${t.runUser}
ExecStart=${currentAppPath(SYSTEMD_INSTANCE)}
EnvironmentFile=${t.envFile}
Environment=SINGULARITY_DIR=${t.dataDir}
Environment=EQUIN_RELEASE_DIR=${t.runtimeDir}
Restart=always
RestartSec=2
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
`;
}

/** This deployment's Caddy site block: TLS in front, plain HTTP on loopback. */
function caddySite(hostnames: string[], loopbackPort: number): string {
  // No `header_up Host`: each install runs its OWN gateway with
  // `-default-namespace <composition>`, and the gateway's `parseWorktree`
  // yields no worktree for anything not ending in `.localhost` — so a public
  // Host falls straight through to the default namespace. Caddy handles ACME,
  // renewal and WebSocket upgrades natively.
  //
  // `encode` and the asset `Cache-Control` belong HERE rather than in the app:
  // the backend serves the web dist uncompressed and unlabelled, so without
  // these every visitor pays ~4x the bytes and every REPEAT visitor re-downloads
  // the whole bundle. Caddy is the only layer that sees the finished response,
  // and it is generated, so a deployment cannot forget them.
  //
  // The `immutable` year is safe for `/assets/*` ONLY: vite content-hashes those
  // filenames, so a changed file is a changed URL. Everything else (the HTML
  // shell, the unhashed root icons) is deliberately left revalidating — caching
  // index.html for a year would pin visitors to a stale build forever.
  return `${hostnames.join(", ")} {
\tencode zstd gzip
\theader /assets/* Cache-Control "public, max-age=31536000, immutable"
\treverse_proxy ${listenAddress(loopbackPort)}
}
`;
}

/**
 * The whole convergent host state, as one idempotent script.
 *
 * Every step is written so that a second run changes nothing and a drifted host
 * is repaired: `id -u` before `useradd`, `install -d` (which re-applies owner
 * and mode), temp-file + `mv` for every file write, `ufw`'s own rule dedupe,
 * and package installs guarded on what is actually present.
 */
function convergeScript(opts: {
  install: InstallLayout;
  hostnames: string[];
  loopbackPort: number;
  sshPort: number;
  sshUser: string;
}): string {
  const { install, hostnames, loopbackPort, sshPort, sshUser } = opts;
  const caddyfile = "/etc/caddy/Caddyfile";
  const keyring = "/usr/share/keyrings/caddy-stable-archive-keyring.gpg";
  const sourceList = "/etc/apt/sources.list.d/caddy-stable.list";
  // The signed-by path is spelled INSIDE the apt source line, so it is derived
  // from the same constant rather than typed twice.
  const debLine = `deb [signed-by=${keyring}] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main`;

  return `${REMOTE_SCRIPT_SHEBANG}
# GENERATED by \`./singularity deploy converge\` — do NOT edit on the host.
# It is regenerated from the deployment row and re-uploaded on every converge,
# so any edit here is silently discarded. Change the deployment instead.
set -euo pipefail

# Everything this script says goes to stderr: \`sshRun\`'s failure result carries
# stderr ONLY, so progress written to stdout would be dropped on exactly the run
# a human needs to read. Command substitutions are unaffected (each sets up its
# own stdout), which is what keeps \`$(...)\` reads below working.
exec 1>&2

C=${sq(install.compositionId)}
RUN_USER=${sq(install.runUser)}
UNIT=${sq(install.unit)}
INSTALL_ROOT=${sq(INSTALL_ROOT)}
INSTALL_DIR=${sq(install.installDir)}
RELEASES_DIR=${sq(install.releasesDir)}
RUNTIME_DIR=${sq(install.runtimeDir)}
DATA_DIR=${sq(install.dataDir)}
ENV_FILE=${sq(install.envFile)}
UNIT_PATH=${sq(UNIT_TEMPLATE_PATH)}
CADDYFILE=${sq(caddyfile)}
CADDY_SITES=${sq(CADDY_SITES_DIR)}
SITE=${sq(install.caddySitePath)}
CADDY_KEYRING=${sq(keyring)}
CADDY_LIST=${sq(sourceList)}

# Converge runs as the server's LOGIN user because it creates users and writes
# /etc. The RUN user is a different, unprivileged, derived one — that split is
# the whole point, so say so loudly if the login user is not root.
if [ "$(id -u)" -ne 0 ]; then
  echo "converge needs root; the server's sshUser is ${sshUser}" >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive

# ── 1. The run user. Derived from the composition name, never read from a
#       field, so it can never be root — which is what makes initdb legal.
if id -u "$RUN_USER" >/dev/null 2>&1; then
  echo "[=] run user $RUN_USER exists"
else
  useradd --system --create-home "$RUN_USER"
  echo "[+] created run user $RUN_USER"
fi

# ── 2. The dir layout. \`install -d\` re-applies owner and mode on every run, so
#       a hand-chowned dir converges back. data/ is 750: it holds the Postgres
#       cluster, the config tree and the logs, and only root and the run user
#       have any business there.
install -d -m 755 "$INSTALL_ROOT"
install -d -m 755 -o "$RUN_USER" -g "$RUN_USER" "$INSTALL_DIR" "$RELEASES_DIR" "$RUNTIME_DIR"
install -d -m 750 -o "$RUN_USER" -g "$RUN_USER" "$DATA_DIR"
echo "[=] layout under $INSTALL_DIR"

# ── 3. The EnvironmentFile: the per-DEPLOYMENT values the shared unit template
#       cannot hold. NO secrets — see the plan, §What goes in \`env\`.
#       0600 root:$RUN_USER is safe because systemd (pid 1, root) reads
#       EnvironmentFile BEFORE dropping to User=, so the service never needs
#       read access itself. The umask is scoped to a SUBSHELL so the temp file is
#       never briefly world-readable, without leaking 077 into the 0644 /etc
#       writes below.
(
  umask 077
  {
    echo "# GENERATED by \\\`singularity deploy converge\\\` — do not edit."
    echo "SINGULARITY_LISTEN=${listenAddress(loopbackPort)}"
  } > "$ENV_FILE.new"
)
chown "root:$RUN_USER" "$ENV_FILE.new"
chmod 600 "$ENV_FILE.new"
mv -f "$ENV_FILE.new" "$ENV_FILE"
echo "[=] $ENV_FILE (SINGULARITY_LISTEN=${listenAddress(loopbackPort)})"

# ── 4a. Base packages. ufw is in the Ubuntu base image and curl is needed by
#        ship's health gate; both are no-ops when present, and apt does no work
#        at all when nothing is missing.
missing=""
for p in curl ca-certificates gnupg ufw; do
  dpkg-query -W -f='\${Status}' "$p" 2>/dev/null | grep -q 'install ok installed' || missing="$missing $p"
done
if [ -n "$missing" ]; then
  echo "[+] installing:$missing"
  apt-get update -qq
  apt-get install -y --no-install-recommends $missing
else
  echo "[=] base packages present"
fi

# ── 4b. Caddy terminates TLS in front; the gateway stays plain HTTP on
#        loopback. Only reached when this deployment declares a hostname —
#        a hostname-less deployment is loopback-only and needs no Caddy.
${
  hostnames.length > 0
    ? `# Caddy is NOT in Ubuntu 24.04's archives, so a bare \`apt-get install -y caddy\`
# fails on a fresh image: the official repo goes in first. The key is fetched
# once (a dearmored key is deterministic, so re-fetching would change nothing);
# the source line is rewritten every run and is content-identical, which is what
# keeps this step convergent.
if [ ! -s "$CADDY_KEYRING" ]; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o "$CADDY_KEYRING.new"
  chmod 644 "$CADDY_KEYRING.new"
  mv -f "$CADDY_KEYRING.new" "$CADDY_KEYRING"
  echo "[+] caddy apt signing key"
fi
printf '%s\\n' ${sq(debLine)} > "$CADDY_LIST.new"
chmod 644 "$CADDY_LIST.new"
mv -f "$CADDY_LIST.new" "$CADDY_LIST"
if ! command -v caddy >/dev/null 2>&1; then
  echo "[+] installing caddy"
  apt-get update -qq
  apt-get install -y caddy
else
  echo "[=] caddy present"
fi

install -d -m 755 "$CADDY_SITES"
cat > "$SITE.new" <<'EQUIN_CADDY_SITE'
${caddySite(hostnames, loopbackPort)}EQUIN_CADDY_SITE
# 0644: the caddy unit runs as User=caddy and must be able to READ its own site.
chmod 644 "$SITE.new"
mv -f "$SITE.new" "$SITE"
echo "[=] $SITE"`
    : `if [ -e "$SITE" ]; then
  rm -f "$SITE"
  echo "[-] removed $SITE (this deployment declares no hostname)"
else
  echo "[=] no Caddy site (this deployment declares no hostname)"
fi`
}

# The root Caddyfile is OURS: converge owns it so the sites dir is genuinely
# imported (the distro default ships an unrelated \`:80\` site and no import we
# can rely on). Written from what is actually in the sites dir, because Caddy
# errors on an import glob that matches nothing — with no sites at all the
# config is deliberately empty, which is exactly "this box serves no hostname".
if command -v caddy >/dev/null 2>&1; then
  if ls "$CADDY_SITES"/*.caddy >/dev/null 2>&1; then
    printf '%s\\n%s\\n' '# GENERATED by singularity deploy converge — do not edit.' "import $CADDY_SITES/*.caddy" > "$CADDYFILE.new"
  else
    printf '%s\\n' '# GENERATED by singularity deploy converge — no deployment on this host declares a hostname.' > "$CADDYFILE.new"
  fi
  chmod 644 "$CADDYFILE.new"
  mv -f "$CADDYFILE.new" "$CADDYFILE"
  caddy validate --config "$CADDYFILE"
  systemctl enable --now caddy
  systemctl reload caddy
  echo "[=] caddy reloaded"
fi

# ── 5. The systemd unit. Reboot survival, crash restart, journald log rotation
#       and the enforced run user all fall out of it — which is why it is the
#       primitive rather than a wrapper script.
cat > "$UNIT_PATH.new" <<'EQUIN_UNIT'
${unitTemplate()}EQUIN_UNIT
chmod 644 "$UNIT_PATH.new"
mv -f "$UNIT_PATH.new" "$UNIT_PATH"
systemctl daemon-reload
systemctl enable "$UNIT" >/dev/null
echo "[=] $UNIT_PATH; $UNIT enabled"

# ── 6. The firewall. ONE multiport rule (a multiport \`ufw allow\` REQUIRES a
#       protocol — bare \`22,80,443\` is rejected) added BEFORE \`--force
#       enable\`, so the SSH session converge is running over survives it. The
#       SSH port comes from the server row, not the literal 22: allowing only 22
#       on a box whose sshd listens elsewhere would lock us out permanently.
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ${sshPort},80,443/tcp >/dev/null
ufw --force enable >/dev/null
echo "[=] ufw: deny incoming, allow ${sshPort},80,443/tcp"

# The env file may have just changed (a new loopback port), and a running
# install would otherwise keep the old listen address while Caddy proxies to the
# new one. Restart only when something is actually running: with nothing shipped
# yet there is no current/app to exec, and \`systemctl start\` would fail.
if systemctl is-active --quiet "$UNIT"; then
  systemctl restart "$UNIT"
  echo "[~] restarted $UNIT to pick up $ENV_FILE"
else
  echo "[=] $UNIT is enabled but not running — nothing shipped yet"
fi

echo "[done] converged $C"
`;
}

// ── D4: bundle discovery + the activate script ────────────────────────────────

interface Bundle {
  runId: string;
  /** The self-extracting binary to ship. */
  localPath: string;
  /** Its name on disk — carries the platform, which is why the unit cannot. */
  binaryName: string;
}

/** `RELEASE.json`, the bundle's own self-description. */
interface ReleaseManifest {
  composition: string;
  target: string;
  platform: string;
  runId: string;
}

/**
 * The ONE directory ship looks in for a composition's bundles, resolved once.
 *
 * **Which namespace it keys on, and why.** `releaseOutDir` roots every release
 * at `<SINGULARITY_DIR>/releases/<namespace>/<comp>-<target>/`, where the
 * namespace is `currentWorktreeName()` — i.e. `SINGULARITY_WORKTREE`, falling
 * back to `main`. Ship keys on exactly the same call, which is what makes the
 * two agree in each of the two real situations:
 *
 * - **hand-run release + hand-run ship** — neither process has
 *   `SINGULARITY_WORKTREE`, so both see `releases/singularity/`, even when the
 *   CLI is invoked from a worktree checkout. (Confirmed against a real
 *   cross-build: `release --platform linux-x64` from this worktree wrote
 *   `releases/singularity/website-web/<run-id>/`, NOT `releases/att-…/`.)
 * - **Studio-triggered release + UI-triggered ship** — both run inside the
 *   worktree backend, so both see `releases/<that worktree>/`.
 *
 * The mismatch is the CROSS pair (a Studio release, then a hand-run ship), and
 * it is deliberately left as a loud miss: this function is never called for more
 * than one namespace, and every refusal below prints the absolute path it looked
 * in. Searching both namespaces would make "which bundle am I shipping?"
 * ambiguous, which is strictly worse than a miss you can read in one line.
 */
function bundleRoot(composition: string): { namespace: string; compDir: string } {
  const namespace = currentWorktreeName();
  return {
    namespace,
    compDir: join(SINGULARITY_DIR, "releases", namespace, `${composition}-web`),
  };
}

/**
 * The hint every bundle-discovery refusal carries: which namespace was searched,
 * and the one way the answer can be "it exists, but not here".
 */
function namespaceHint(namespace: string): string {
  return (
    `Release namespace: "${namespace}" (from SINGULARITY_WORKTREE, else main). ` +
    `A release cut from the Studio UI lands under its own worktree's namespace instead, ` +
    `and ship deliberately does not search a second one.`
  );
}

/**
 * Resolve which bundle to ship.
 *
 * The canonical filesystem layout IS the registry (see
 * `plugins/release/CLAUDE.md`, §Discovery) — there is no DB query: run dirs
 * under {@link bundleRoot}, a `latest` symlink at the current one, and a
 * self-describing `RELEASE.json` inside each.
 */
function resolveBundle(opts: {
  composition: string;
  platform: PlatformTag;
  release?: string;
}): Bundle {
  const { composition, platform } = opts;
  const { namespace, compDir } = bundleRoot(composition);
  if (!existsSync(compDir)) {
    refuse(
      `no release of "${composition}" found. Looked in:\n  ${compDir}\n` +
        `${namespaceHint(namespace)}\n` +
        `Build one: ./singularity release --composition ${composition} --target web --platform ${platform}`,
    );
  }

  let runDir: string;
  if (opts.release !== undefined) {
    runDir = join(compDir, opts.release);
    if (!existsSync(runDir)) {
      const runs = readdirSync(compDir).filter((d) => d !== "latest");
      refuse(
        `release run "${opts.release}" does not exist. Looked in:\n  ${runDir}\n` +
          `Available runs in ${compDir}: ${runs.length > 0 ? runs.sort().join(", ") : "(none)"}\n` +
          namespaceHint(namespace),
      );
    }
  } else {
    const latest = join(compDir, "latest");
    if (!existsSync(latest)) {
      refuse(
        `no \`latest\` release pointer. Looked for:\n  ${latest}\n` +
          `${namespaceHint(namespace)}\n` +
          `Pass --release <run-id> to name a run explicitly.`,
      );
    }
    runDir = realpathSync(latest);
  }

  const manifestPath = join(runDir, "RELEASE.json");
  if (!existsSync(manifestPath)) {
    refuse(`${runDir} holds no RELEASE.json — it is not a complete release run.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ReleaseManifest;

  // Every field is cross-checked against something ELSE that knows it, so a
  // mismatch is caught here — loudly, by name — rather than at `systemctl
  // start`, where it would present as a crash loop.
  if (manifest.composition !== composition) {
    refuse(
      `${manifestPath} was built for composition "${manifest.composition}", not "${composition}".`,
    );
  }
  if (manifest.target !== "web") {
    refuse(
      `${manifestPath} is a "${manifest.target}" release; only the \`web\` target is shippable to a server.`,
    );
  }
  // The platform is DISCOVERED on both sides — the release's own record of what
  // it built, and the server's own `uname`. Comparing two observed facts leaves
  // no third place for a human to have typed it wrong.
  if (manifest.platform !== platform) {
    refuse(
      `platform mismatch: ${manifestPath} is ${manifest.platform}, but the server reports ` +
        `${platform}. Rebuild with --platform ${platform}.`,
    );
  }
  const runId = basename(runDir);
  if (manifest.runId !== runId) {
    refuse(
      `${manifestPath} declares runId "${manifest.runId}" but sits in "${runId}" — the release dir is inconsistent.`,
    );
  }

  const binaryName = `${composition}-web-${platform}`;
  const localPath = join(runDir, "dist", binaryName);
  if (!existsSync(localPath)) {
    refuse(
      `${localPath} is missing — that release was staged (\`--dev\`) but never packed into a shippable binary.`,
    );
  }
  return { runId, localPath, binaryName };
}

/**
 * Activate an uploaded bundle: entrypoint symlink → flip `current` → restart →
 * health gate, reverting on failure.
 *
 * This is ONE script on the host rather than a sequence of `sshRun`s for one
 * reason: the revert must run even if the CLI dies or the connection drops
 * mid-gate. A deploy command whose failure mode is "the site is now broken and
 * stays broken" is not shippable.
 */
function activateScript(opts: {
  install: InstallLayout;
  runId: string;
  binaryName: string;
  loopbackPort: number;
}): string {
  const { install, runId, binaryName, loopbackPort } = opts;
  const dir = releaseDir(install.compositionId, runId);
  const base = `http://${listenAddress(loopbackPort)}`;

  return `${REMOTE_SCRIPT_SHEBANG}
# GENERATED by \`./singularity deploy ship\` — do NOT edit on the host.
set -euo pipefail

# Progress to stderr, for the same reason as the converge script: a FAILED
# \`sshRun\` returns stderr only, and the failing ship is the one whose log
# matters. See \`runScript\`.
exec 1>&2

UNIT=${sq(install.unit)}
RUN_USER=${sq(install.runUser)}
RELEASE_DIR=${sq(dir)}
BINARY=${sq(binaryName)}
APP=${sq(releaseAppPath(install.compositionId, runId))}
CURRENT=${sq(install.currentLink)}
CACHE=${sq(`${install.runtimeDir}/equin-release`)}
STALE=${sq(`${install.runtimeDir}/.stale-`)}$$
READY_URL=${sq(`${base}/api/health/ready`)}
HEALTH_URL=${sq(`${base}/api/health`)}
RUN_ID=${sq(runId)}

if [ ! -s "$RELEASE_DIR/$BINARY" ]; then
  echo "activate: $RELEASE_DIR/$BINARY is missing or empty — the upload did not land" >&2
  exit 1
fi
chmod 755 "$RELEASE_DIR/$BINARY"

# The fixed-name entrypoint, created BEFORE the flip so \`current\` never points
# at a dir the unit cannot exec. Relative, so the release dir stays relocatable.
ln -sfn "$BINARY" "$APP.new"
mv -fT "$APP.new" "$APP"
chown -R "$RUN_USER:$RUN_USER" "$RELEASE_DIR"

# What was serving, captured before the flip — this is what a failure restores.
# Empty on a first ship, which is a state of its own below.
PREV="$(readlink "$CURRENT" 2>/dev/null || true)"

MOVED=0
FLIPPED=0
GATE_OK=0

# EVERY failure after this point undoes itself, not just a failed gate: a unit
# that will not restart (an un-converged host) or an ssh deadline mid-gate would
# otherwise leave \`current\` pointing at a build that is not serving. The trap is
# what makes "production is never left down by a bad ship" true for the whole
# rest of the script rather than for the one branch that thought of it.
undo() {
  set +e   # best-effort recovery; the script's own non-zero status still stands
  if [ "$MOVED" -eq 1 ]; then
    mkdir -p "$CACHE"
    mv -- "$STALE"/* "$CACHE"/
    rmdir "$STALE"
    echo "reverted: restored the previous extraction cache" >&2
  fi
  if [ "$FLIPPED" -eq 1 ]; then
    if [ -n "$PREV" ]; then
      ln -sfn "$PREV" "$CURRENT.new"
      mv -fT "$CURRENT.new" "$CURRENT"
      # Say which of the two happened: "reverted and restarted" and "reverted but
      # the host is still down" are very different things to be told.
      if systemctl restart "$UNIT"; then
        echo "reverted: current -> $PREV, $UNIT restarted" >&2
      else
        echo "reverted: current -> $PREV, but restarting $UNIT ALSO failed — the host is DOWN" >&2
      fi
    else
      systemctl stop "$UNIT"
      rm -f "$CURRENT"
      echo "reverted: nothing served before this ship — $UNIT stopped, current removed" >&2
    fi
  fi
  echo "--- journalctl -u $UNIT -n 200 ---" >&2
  journalctl -u "$UNIT" -n 200 --no-pager >&2
}
on_exit() {
  status=$?
  if [ "$status" -ne 0 ] && [ "$GATE_OK" -eq 0 ]; then undo; fi
  exit "$status"
}
trap on_exit EXIT

# Move the extraction cache aside rather than deleting it. The self-extractor
# keys its extract dir on the tarball hash, so every ship would otherwise leave
# a full extracted bundle behind forever — but a revert needs the PREVIOUS
# bundle's cache, so it is only destroyed once the gate has passed.
if [ -d "$CACHE" ] && [ -n "$(ls -A "$CACHE" 2>/dev/null || true)" ]; then
  mkdir -p "$STALE"
  mv -- "$CACHE"/* "$STALE"/
  MOVED=1
fi

# The flip IS the deploy. rename(2) over the existing symlink, so no window
# exists in which \`current\` is absent.
ln -sfn "$RELEASE_DIR" "$CURRENT.new"
mv -fT "$CURRENT.new" "$CURRENT"
FLIPPED=1
echo "[+] current -> $RELEASE_DIR (was: \${PREV:-<none>})"

systemctl restart "$UNIT"

# ── The health gate. Three outcomes, deliberately distinguished:
#     ok=1  ready AND serving the runId we shipped   → success
#     ok=0  never became ready within the window     → "not up"
#     ok=2  ready, but /api/health names another build → the flip did not take
ok=0
body=""
for _ in $(seq 1 ${READY_ATTEMPTS}); do
  if curl -fsS -m 5 "$READY_URL" >/dev/null 2>&1; then ok=1; break; fi
  sleep ${READY_INTERVAL_SEC}
done
if [ "$ok" -eq 1 ]; then
  body="$(curl -fsS -m 5 "$HEALTH_URL" || true)"
  # Liveness alone would let a failed flip pass as success: the PREVIOUS build
  # answers /api/health/ready perfectly happily. The runId is what makes "the
  # build I shipped is the build now answering" checkable.
  printf '%s' "$body" | grep -Eq '"runId"[[:space:]]*:[[:space:]]*"'"$RUN_ID"'"' || ok=2
fi

if [ "$ok" -ne 1 ]; then
  if [ "$ok" -eq 0 ]; then
    echo "gate: $UNIT never became ready at $READY_URL within ${
      READY_ATTEMPTS * READY_INTERVAL_SEC
    }s" >&2
  else
    echo "gate: ready, but /api/health does not report the shipped runId $RUN_ID:" >&2
    printf '%s\\n' "$body" >&2
  fi
  # The trap does the revert and prints the journal — one recovery path for
  # every failure mode, not one per branch that remembered.
  exit 1
fi
GATE_OK=1

# Gate passed: the previous extraction cache has no rollback value now, and on a
# box nobody SSHes into, disk-fill is the failure that takes the site down
# silently. Exactly one extracted bundle is left behind.
if [ "$MOVED" -eq 1 ]; then
  rm -rf -- "$STALE"
  echo "[=] pruned the previous extraction cache under $CACHE"
fi

echo "[ok] $UNIT is serving runId $RUN_ID"
printf '%s\\n' "$body"
`;
}

// ── Command surface ───────────────────────────────────────────────────────────

export function registerDeploy(program: Command) {
  const deploy = program
    .command("deploy")
    .description(
      "Converge a host to serve a composition, and ship bundles to it (Deploy app deployments)",
    );

  deploy
    .command("converge")
    .description(
      "Make a server serve a composition: run user, dir layout, env file, Caddy site, systemd unit, firewall. Idempotent — re-run to repair drift.",
    )
    .argument("<composition>", "Composition name (as in the `compositions` config)")
    .requiredOption("--server <server>", "Registered deploy server (id, or its name)")
    .action(async (composition: string, opts: { server: string }) => {
      const target = await resolveTarget({ composition, serverRef: opts.server });
      const { install, deployment, server } = target;

      console.log(`Converging "${composition}" on ${server.name} (${server.host})`);
      console.log(`  Install: ${install.installDir} as ${install.runUser}`);
      console.log(`  Listen:  ${listenAddress(deployment.loopbackPort)}`);
      console.log(
        `  Hosts:   ${
          deployment.hostnames.length > 0 ? deployment.hostnames.join(", ") : "(none — loopback only)"
        }`,
      );

      // ── Refusals, all of them before the first host mutation ──────────────
      // apt-get / systemd / ufw make this script Debian-family-specific, so a
      // non-Linux server is a refusal rather than a confusing mid-script error.
      if (!isLinuxTag(target.platform)) {
        refuse(
          `server "${server.name}" reports ${target.platform}; converge targets Debian/Ubuntu ` +
            `Linux (it uses apt-get, systemd and ufw).`,
        );
      }
      for (const hostname of deployment.hostnames) assertCaddySafeHostname(hostname);
      await assertClosureSafe(target);

      await runScript(target, {
        script: convergeScript({
          install,
          hostnames: deployment.hostnames,
          loopbackPort: deployment.loopbackPort,
          sshPort: server.port,
          sshUser: server.sshUser,
        }),
        remoteName: `equin-converge-${composition}.sh`,
        timeoutMs: CONVERGE_MS,
        what: "converge",
      });

      console.log(`\n[done] ${server.name} is converged for "${composition}".`);
      console.log(`  Ship a bundle: ./singularity deploy ship ${composition} --server ${opts.server}`);
    });

  deploy
    .command("ship")
    .description(
      "Upload a release bundle to a converged host and activate it behind a health gate (reverts on failure)",
    )
    .argument("<composition>", "Composition name (as in the `compositions` config)")
    .requiredOption("--server <server>", "Registered deploy server (id, or its name)")
    .option(
      "--release <run-id>",
      "Release run to ship (default: the `latest` symlink for <composition>-web)",
    )
    .action(
      async (composition: string, opts: { server: string; release?: string }) => {
        const target = await resolveTarget({ composition, serverRef: opts.server });
        const { install, deployment, server } = target;

        // The platform is taken from the server's health row, never a flag —
        // and `resolveBundle` asserts RELEASE.json agrees with it.
        const bundle = resolveBundle({
          composition,
          platform: target.platform,
          release: opts.release,
        });
        const dir = releaseDir(composition, bundle.runId);

        console.log(`Shipping "${composition}" ${bundle.runId} to ${server.name} (${server.host})`);
        console.log(`  Bundle:  ${bundle.localPath} (${target.platform})`);
        console.log(`  Target:  ${dir}/${bundle.binaryName}`);

        // Pre-flight: is this host actually converged for this composition?
        // Without it, an un-converged host fails at `systemctl restart` — after
        // a 100MB upload and a flip — so the honest refusal is here, before
        // either. `command-failed` means the remote `test` RAN and said no;
        // anything else is an SSH-layer problem and must not be read as "not
        // converged".
        const converged = await sshRun(sshTargetFor(target, SSH_SHORT_MS), [
          "test",
          "-f",
          UNIT_TEMPLATE_PATH,
          "-a",
          "-f",
          install.envFile,
        ]);
        if (!converged.ok) {
          if (converged.kind === "command-failed") {
            refuse(
              `server "${server.name}" is not converged for "${composition}" ` +
                `(${UNIT_TEMPLATE_PATH} or ${install.envFile} is missing). Run:\n` +
                `  ./singularity deploy converge ${composition} --server ${opts.server}`,
            );
          }
          refuse(
            `checking whether ${server.name} is converged failed (${converged.kind}): ` +
              `${converged.message}\n${converged.stderr}`,
          );
        }

        // `scp` does not create the remote parent dir, and making the upload
        // primitive silently do two things would hide that from every caller.
        await remote(target, ["mkdir", "-p", dir], {
          timeoutMs: SSH_SHORT_MS,
          what: `creating ${dir}`,
        });

        console.log("  • uploading bundle");
        const upload = await sshUpload(
          sshTargetFor(target, UPLOAD_MS),
          bundle.localPath,
          `${dir}/${bundle.binaryName}`,
        );
        if (!upload.ok) {
          refuse(
            `uploading the bundle to ${server.name} failed (${upload.kind}): ` +
              `${upload.message}\n${upload.stderr}`,
          );
        }

        console.log("  • activating (flip + restart + health gate)");
        await runScript(target, {
          script: activateScript({
            install,
            runId: bundle.runId,
            binaryName: bundle.binaryName,
            loopbackPort: deployment.loopbackPort,
          }),
          remoteName: `equin-activate-${composition}.sh`,
          timeoutMs: ACTIVATE_MS,
          what: "activate",
        });

        console.log(`\n[done] ${server.name} is serving "${composition}" ${bundle.runId}.`);
        if (deployment.hostnames.length > 0) {
          for (const hostname of deployment.hostnames) {
            console.log(`  https://${hostname}`);
          }
        } else {
          console.log(
            `  No hostname on this deployment — reachable only at ${listenAddress(
              deployment.loopbackPort,
            )} on the host.`,
          );
        }
      },
    );
}
