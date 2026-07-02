import { useEffect, useMemo, useState, type ReactElement } from "react";
import { processEmailHtml } from "../internal/process-email-html";
import "./mail-html.css";

export interface MailHtmlProps {
  /** Raw email HTML (e.g. `mail_messages.body_html`). */
  html: string;
  /** Whether the user has opted into loading remote images for this message. */
  showRemoteImages: boolean;
  /**
   * Called after render with whether the source referenced any remote image —
   * lets the reading pane show/hide the "Display images" affordance.
   */
  onRemoteImagesDetected?: (present: boolean) => void;
  /**
   * Resolve a bare Content-ID (no angle brackets) to an inline-attachment URL,
   * or undefined while the attachment is not yet available. Passed through
   * render, so the body re-processes (and cid placeholders fill in) as more
   * attachments hydrate.
   */
  resolveCid?: (cid: string) => string | undefined;
}

/**
 * Privacy-safe email HTML renderer. Runs the sanitize → image-gate →
 * cid-resolve → quoted-history-collapse pipeline (see process-email-html) and
 * injects the result inside a style-scoped container. The trimmed quoted
 * history starts collapsed behind a `•••` toggle.
 */
export function MailHtml({
  html,
  showRemoteImages,
  onRemoteImagesDetected,
  resolveCid,
}: MailHtmlProps): ReactElement {
  const processed = useMemo(
    () => processEmailHtml(html, { showRemoteImages, resolveCid }),
    [html, showRemoteImages, resolveCid],
  );

  const [showQuoted, setShowQuoted] = useState(false);

  useEffect(() => {
    onRemoteImagesDetected?.(processed.hadRemoteImage);
  }, [processed.hadRemoteImage, onRemoteImagesDetected]);

  return (
    <div className="mail-html-body">
      <div dangerouslySetInnerHTML={{ __html: processed.mainHtml }} />
      {processed.quotedHtml !== null && (
        <>
          <button
            type="button"
            className="mail-html-quote-toggle"
            aria-expanded={showQuoted}
            aria-label={showQuoted ? "Hide trimmed content" : "Show trimmed content"}
            onClick={() => setShowQuoted((v) => !v)}
          >
            {showQuoted ? "Hide trimmed content" : "•••"}
          </button>
          {showQuoted && (
            <div
              className="mail-html-quoted"
              dangerouslySetInnerHTML={{ __html: processed.quotedHtml }}
            />
          )}
        </>
      )}
    </div>
  );
}
