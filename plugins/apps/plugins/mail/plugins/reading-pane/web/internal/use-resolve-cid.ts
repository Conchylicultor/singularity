import { useCallback, useState } from "react";
import type { MailAttachment } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { mailAttachmentUrl } from "@plugins/apps/plugins/mail/plugins/attachments/core";
import { useMailAttachment } from "@plugins/apps/plugins/mail/plugins/attachments/web";

/** Strip the surrounding angle brackets Gmail wraps a Content-ID in. */
function bareCid(cid: string): string {
  return cid.replace(/^<|>$/g, "").trim();
}

/**
 * A `resolveCid` callback for `<MailHtml>`: maps an inline image's `cid:` to a
 * same-origin attachment URL. `<MailHtml>` calls this synchronously while walking
 * the sanitized DOM and re-renders whenever the returned value changes, so this
 * returns the URL when known and `undefined` otherwise — kicking off the lazy
 * download in the background and flipping to the URL (via state) once resolved.
 *
 * - A stored inline attachment resolves instantly (no round-trip).
 * - An un-downloaded one returns `undefined`, triggers `download(...)`, and
 *   updates state on completion so `<MailHtml>` re-renders with the real src.
 * - An unknown cid (no matching attachment) returns `undefined` permanently, so
 *   `<MailHtml>` drops the broken image.
 */
export function useResolveCid(
  attachments: MailAttachment[],
): (cid: string) => string | undefined {
  const { download } = useMailAttachment();
  const [resolved, setResolved] = useState<Record<string, string>>({});

  return useCallback(
    (cid: string): string | undefined => {
      const target = bareCid(cid);
      const att = attachments.find(
        (a) => a.contentId != null && bareCid(a.contentId) === target,
      );
      if (!att) return undefined;

      if (att.storedAttachmentId) return mailAttachmentUrl(att.storedAttachmentId);
      if (resolved[att.id]) return resolved[att.id];

      // Kick off the lazy download; the .then runs on a later microtask, so no
      // setState happens during the caller's render. A rejection surfaces loudly.
      void download(att.id).then((url) => {
        setResolved((prev) =>
          prev[att.id] === url ? prev : { ...prev, [att.id]: url },
        );
      });
      return undefined;
    },
    [attachments, resolved, download],
  );
}
