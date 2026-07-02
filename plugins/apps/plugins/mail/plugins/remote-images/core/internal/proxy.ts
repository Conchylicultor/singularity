// Same-origin, SSRF-guarded proxy for remote images embedded in email HTML.
// Email `<img src="https://…">` is never loaded directly (privacy: tracking
// pixels, IP leakage) — the reading pane rewrites each remote src to this proxy
// URL, and only once the user opts into "Display images" for that message. The
// server handler (`remote-images/server`) fetches through `safeFetch` and only
// streams back `image/*` responses.

/** The proxy route, shared by the server handler registration and the URL helper. */
export const MAIL_IMAGE_PROXY_ROUTE = "GET /api/mail/image";

/** Build the same-origin proxy URL for a remote image URL. */
export function mailImageProxyUrl(remoteUrl: string): string {
  return `/api/mail/image?url=${encodeURIComponent(remoteUrl)}`;
}
