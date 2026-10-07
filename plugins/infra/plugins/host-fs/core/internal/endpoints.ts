import { z } from "zod";
import { blob, defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// ── Shared shapes ────────────────────────────────────────────────────────────

/**
 * What one directory entry is, judged by what it RESOLVES to: a symlink to a
 * directory is a `dir` (and carries `symlinkTarget`), a symlink to a file is a
 * `file`. `symlink` is reserved for a link that resolves to nothing readable
 * (dangling, looping, or behind a denied directory). `other` is a socket, FIFO
 * or device.
 */
export const HostFsEntryKindSchema = z.enum([
  "dir",
  "file",
  "symlink",
  "other",
]);
export type HostFsEntryKind = z.infer<typeof HostFsEntryKindSchema>;

export const HostFsEntrySchema = z.object({
  name: z.string(),
  kind: HostFsEntryKindSchema,
  /** Bytes, of the resolved target for a followed symlink. */
  size: z.number(),
  mtimeMs: z.number(),
  /**
   * When the entry was created, where the filesystem records it. Absent inside
   * an archive, and on a filesystem without birth time.
   */
  birthtimeMs: z.number().optional(),
  /**
   * Last access as the filesystem records it — approximate (relatime / lazy
   * updates, and our own reads bump it). Absent inside an archive.
   */
  atimeMs: z.number().optional(),
  /** A dotfile. Presentation only: hidden entries are still listed. */
  hidden: z.boolean(),
  /** The link's own text (`readlink`), present iff the entry is a symlink. */
  symlinkTarget: z.string().optional(),
  /**
   * Present on a real file whose name a registered archive format claims
   * (`.zip`, …): it stays a `file`, and can also be browsed like a folder —
   * `list` of its path lists the archive's root. Never set on an entry inside
   * an archive (archives within archives are not browsed).
   */
  archive: z.object({ format: z.string() }).optional(),
});
export type HostFsEntry = z.infer<typeof HostFsEntrySchema>;

/**
 * Whether an entry can be opened like a folder: a directory, or an archive
 * file. The one test every "does this expand?" decision makes — a consumer
 * that wants real directories only (a folder picker) tests `kind === "dir"`.
 */
export function isBrowsable(
  entry: Pick<HostFsEntry, "kind" | "archive">,
): boolean {
  return entry.kind === "dir" || entry.archive !== undefined;
}

/**
 * Set on a `list` / `stat` answer whose path lies INSIDE an archive: the path
 * is virtual (`…/photos.zip/2022/a.jpg`), so it has no git status, cannot be
 * opened with its default app, and is revealed as the archive file itself.
 */
export const HostFsWithinSchema = z.object({
  /** The archive file on disk, absolute. */
  archive: z.string(),
  format: z.string(),
});
export type HostFsWithin = z.infer<typeof HostFsWithinSchema>;

/** Why an archive (or one member of it) cannot be read. */
export const HostFsArchiveReasonSchema = z.enum([
  "corrupt",
  "encrypted",
  "unsupported-method",
  "too-many-entries",
]);
export type HostFsArchiveReason = z.infer<typeof HostFsArchiveReasonSchema>;

/** The path does not exist (ENOENT, or a component of it is not a directory). */
const Missing = z.object({ kind: z.literal("missing"), path: z.string() });
/** The user account may not read it (EACCES / EPERM — e.g. ~/.Trash without Full Disk Access). */
const Denied = z.object({ kind: z.literal("denied"), path: z.string() });
const NotADir = z.object({ kind: z.literal("not-a-dir"), path: z.string() });
const NotAFile = z.object({ kind: z.literal("not-a-file"), path: z.string() });
/** The path crosses into an archive that cannot be read (or a member that cannot be decoded). */
const UnreadableArchive = z.object({
  kind: z.literal("unreadable-archive"),
  path: z.string(),
  /** The archive file on disk. */
  archive: z.string(),
  reason: HostFsArchiveReasonSchema,
});

/**
 * Every host-fs read takes an absolute path or one starting with `~`
 * (expanded to the user's home). A relative path, or one carrying a NUL, is a
 * 400 — there is no working directory a host path could be relative to.
 *
 * A path may cross into an archive (`~/Downloads/x.zip/photos/a.jpg`): `list`,
 * `stat`, `text` and `raw` read the member; `complete` and `volume` stay on
 * disk.
 */
const PathQuery = z.object({ path: z.string().optional() });

// ── list ─────────────────────────────────────────────────────────────────────

export const HostFsListResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    /** The resolved absolute path (`~` expanded, `..` collapsed, no trailing slash). */
    path: z.string(),
    /** `null` at the filesystem root. */
    parent: z.string().nullable(),
    /** Every entry, hidden ones included, sorted by name. */
    entries: z.array(HostFsEntrySchema),
    within: HostFsWithinSchema.optional(),
  }),
  Missing,
  Denied,
  NotADir,
  UnreadableArchive,
]);
export type HostFsListResult = z.infer<typeof HostFsListResultSchema>;

/**
 * List a host directory. With no `path`, lists the user's home directory.
 * A symlink to a directory lists the directory it points at; an archive file
 * (an entry carrying `archive`) lists the archive's root.
 */
export const hostFsList = defineEndpoint({
  route: "GET /api/host-fs/list",
  query: PathQuery,
  response: HostFsListResultSchema,
});

// ── stat ─────────────────────────────────────────────────────────────────────

export const HostFsStatResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    path: z.string(),
    parent: z.string().nullable(),
    entry: HostFsEntrySchema,
    within: HostFsWithinSchema.optional(),
  }),
  Missing,
  Denied,
  UnreadableArchive,
]);
export type HostFsStatResult = z.infer<typeof HostFsStatResultSchema>;

/** Describe one host path (e.g. path-bar validation: a file → open its parent). */
export const hostFsStat = defineEndpoint({
  route: "GET /api/host-fs/stat",
  query: z.object({ path: z.string() }),
  response: HostFsStatResultSchema,
});

// ── complete ─────────────────────────────────────────────────────────────────

/** How many completions one request returns at most (`truncated` says if there were more). */
export const HOST_FS_COMPLETE_LIMIT = 50;

export const HostFsCompleteResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    /** The directory whose children were matched (`dirname` of the prefix). */
    dir: z.string(),
    matches: z.array(z.object({ name: z.string(), path: z.string() })),
    truncated: z.boolean(),
  }),
  Missing,
  Denied,
  NotADir,
]);
export type HostFsCompleteResult = z.infer<typeof HostFsCompleteResultSchema>;

/**
 * Folder-only completions of a typed path: the directories (symlinks to
 * directories included) in `dirname(prefix)` whose name starts with
 * `basename(prefix)`, case-insensitively. A prefix ending in `/` completes
 * every child of that directory. Dotfolders are offered only once the typed
 * fragment starts with `.`. Expands `~`.
 */
export const hostFsComplete = defineEndpoint({
  route: "GET /api/host-fs/complete",
  query: z.object({ prefix: z.string() }),
  response: HostFsCompleteResultSchema,
});

// ── text ─────────────────────────────────────────────────────────────────────

/** The largest file `text` decodes (2 MiB). Bigger files answer `too-large`. */
export const HOST_FS_TEXT_MAX_BYTES = 2 * 1024 * 1024;

export const HostFsTextResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    path: z.string(),
    content: z.string(),
    size: z.number(),
  }),
  z.object({
    kind: z.literal("too-large"),
    path: z.string(),
    size: z.number(),
  }),
  /** A NUL byte in the first 8 KB. */
  z.object({ kind: z.literal("binary"), path: z.string(), size: z.number() }),
  Missing,
  Denied,
  NotAFile,
  UnreadableArchive,
]);
export type HostFsTextResult = z.infer<typeof HostFsTextResultSchema>;

/** Read a host file as UTF-8 text, capped and binary-sniffed. */
export const hostFsText = defineEndpoint({
  route: "GET /api/host-fs/text",
  query: z.object({ path: z.string() }),
  response: HostFsTextResultSchema,
});

// ── raw ──────────────────────────────────────────────────────────────────────

/**
 * A host file's bytes, streamed: `Content-Type` from the extension, `Range`
 * honoured (one range; PDF / video seeking), served inline but sandboxed
 * (`Content-Security-Policy: sandbox`, `nosniff`, `Cross-Origin-Resource-Policy:
 * same-site`) so an HTML or SVG file cannot run script on the app's origin. A PDF
 * drops `sandbox` (the browser's PDF viewer will not run in a sandboxed document).
 * 404 missing, 403 denied, 400 for a directory, 422 for an unreadable archive
 * member. A member stored uncompressed honours `Range`; a compressed one is
 * served whole (RFC 9110 lets a server ignore Range). Build URLs with
 * `hostFileUrl`.
 */
export const hostFsRaw = defineEndpoint({
  route: "GET /api/host-fs/raw",
  query: z.object({ path: z.string() }),
  response: blob(),
});

/** The same-origin URL of a host file's raw bytes (for `<img src>`, `<video>`, iframes, links). */
export function hostFileUrl(path: string): string {
  return `${hostFsRaw.path}?${new URLSearchParams({ path }).toString()}`;
}

// ── volume ───────────────────────────────────────────────────────────────────

export const HostFsVolumeResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    path: z.string(),
    /** The volume's display name ("Macintosh HD", or the `/Volumes/<name>` it is mounted at). */
    name: z.string(),
    /** Bytes. */
    total: z.number(),
    /** Bytes available to the user account. */
    free: z.number(),
  }),
  Missing,
  Denied,
]);
export type HostFsVolumeResult = z.infer<typeof HostFsVolumeResultSchema>;

/** The storage of the volume holding `path` (home by default). */
export const hostFsVolume = defineEndpoint({
  route: "GET /api/host-fs/volume",
  query: PathQuery,
  response: HostFsVolumeResultSchema,
});

// ── open ─────────────────────────────────────────────────────────────────────

export const HostFsOpenResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("opened"), path: z.string() }),
  /** Open with default app on a file inside an archive: there is no file on disk to hand an app. */
  z.object({
    kind: z.literal("in-archive"),
    path: z.string(),
    archive: z.string(),
  }),
  Missing,
  Denied,
]);
export type HostFsOpenResult = z.infer<typeof HostFsOpenResultSchema>;

/**
 * Open a host path with its default app (`open <path>`), or reveal it in the
 * Finder (`reveal: true` → `open -R <path>`; a path inside an archive reveals
 * the archive). The one side effect host-fs has:
 * a request whose `Origin` is not a `*.localhost` origin is refused (403).
 */
export const hostFsOpen = defineEndpoint({
  route: "POST /api/host-fs/open",
  body: z.object({ path: z.string(), reveal: z.boolean().optional() }),
  response: HostFsOpenResultSchema,
});
