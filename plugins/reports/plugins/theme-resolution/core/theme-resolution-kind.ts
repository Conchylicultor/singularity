import { z } from "zod";

// The theme-resolution report payload, stored in the generic `data` jsonb column
// and validated on ingest by the theme-resolution ReportKind. Mirrors
// `ThemeResolutionFault`, the neutral body the theme painter emits into
// `themeResolutionReportSink` when a scope's theme cannot be painted as stored.
//
// This union is a deliberate DUPLICATE of `ThemeResolutionFault`, not an
// import: that type lives on theme-engine's WEB barrel (it travels with the sink
// it describes), and this file is `core` — shared with the server, which must
// never pull a browser runtime in. The web collector maps one onto the other
// under `satisfies`, so a fault kind added to the painter is a type error THERE
// rather than a 400 at ingest.
export const ThemeResolutionPayloadSchema = z.discriminatedUnion("fault", [
  // A scope selects a theme that does not exist, so it paints Default. The
  // delete endpoint refuses to orphan a selection, so this takes a hand-edited
  // config file (or a theme deleted outside the app).
  z.object({
    fault: z.literal("missing-theme"),
    // `app:<id>`, or absent for the desktop.
    scopeId: z.string().optional(),
    themeId: z.string(),
  }),
  // A stored theme carries a fragment for a token group no plugin registers any
  // more (the group was deleted or renamed). The rest of the theme paints.
  z.object({
    fault: z.literal("unregistered-group"),
    themeId: z.string(),
    groupId: z.string(),
  }),
  // A stored theme carries tokens its group's schema no longer declares (a
  // token was renamed or dropped). They are ignored; the rest paints.
  z.object({
    fault: z.literal("unknown-tokens"),
    themeId: z.string(),
    groupId: z.string(),
    tokens: z.array(z.string()),
  }),
]);
export type ThemeResolutionPayload = z.infer<
  typeof ThemeResolutionPayloadSchema
>;

// Fingerprint = sha256 of the fault's identity, first 16 hex chars: the fault
// kind plus what it is ABOUT — (scope, theme) for a missing theme, (theme, group)
// for a retired group, (theme, group, sorted tokens) for dropped tokens. Every
// mount of the painter re-emits the same fault, so these collapse onto one row
// per defect instead of one per page load.
export async function themeResolutionFingerprint(
  data: ThemeResolutionPayload,
): Promise<string> {
  const identity =
    data.fault === "missing-theme"
      ? [data.fault, data.scopeId ?? "", data.themeId]
      : data.fault === "unregistered-group"
        ? [data.fault, data.themeId, data.groupId]
        : [data.fault, data.themeId, data.groupId, ...[...data.tokens].sort()];
  return sha256Hex(identity.join("\0")).then((h) => h.slice(0, 16));
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
