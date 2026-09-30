/**
 * Identity of the emojibase data mirror, shared by this plugin's picker (which
 * hands frimousse its `emojibaseUrl`) and its server barrel (which registers
 * the mirror). Plugin-private DRY — never imported cross-plugin.
 */

/** Mirror id → URL segment `/api/asset-mirror/emojibase/…`. */
export const EMOJIBASE_MIRROR_ID = "emojibase";

/**
 * The emojibase-data release the picker reads, pinned so the mirrored files
 * (cached once per machine, served immutable) never change under a version
 * bump nobody reviewed. frimousse fetches `<base>/<locale>/data.json` and
 * `<base>/<locale>/messages.json`.
 */
export const EMOJIBASE_REMOTE_BASE =
  "https://cdn.jsdelivr.net/npm/emojibase-data@17.0.0";

/** The one locale the picker loads (its search labels are English). */
export const EMOJIBASE_LOCALE = "en";

/** The files frimousse requests for {@link EMOJIBASE_LOCALE}, relative to the base. */
export const EMOJIBASE_FILES = [
  `${EMOJIBASE_LOCALE}/data.json`,
  `${EMOJIBASE_LOCALE}/messages.json`,
];
