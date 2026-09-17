import { z } from "zod";

/** How a visit arrived — a closed list, derived from its referrer and campaign tags. */
export const CHANNELS = [
  "Direct",
  "Search",
  "Social",
  "Referral",
  "Campaign",
] as const;
export const ChannelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof ChannelSchema>;

/** The `utm_*` tags read from the landing URL. */
export interface UtmTags {
  source?: string;
  medium?: string;
  campaign?: string;
}

// Registrable-domain stems, matched against the host with any subdomain (and
// any country suffix for search engines) allowed. Closed on purpose: a site
// missing here is a Referral, which is a true statement about it.
const SEARCH_HOSTS = [
  "google",
  "bing.com",
  "duckduckgo.com",
  "search.yahoo.com",
  "yandex",
  "baidu.com",
  "ecosia.org",
  "qwant.com",
  "kagi.com",
  "startpage.com",
  "search.brave.com",
  "perplexity.ai",
];
const SOCIAL_HOSTS = [
  "x.com",
  "twitter.com",
  "t.co",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "linkedin.com",
  "lnkd.in",
  "reddit.com",
  "news.ycombinator.com",
  "lobste.rs",
  "mastodon.social",
  "bsky.app",
  "threads.net",
  "youtube.com",
  "tiktok.com",
  "discord.com",
  "telegram.org",
  "t.me",
  "whatsapp.com",
];

/** Lowercased, without a leading `www.`: the form referrer hosts are stored in. */
export function normalizeHost(host: string): string {
  const lower = host.trim().toLowerCase();
  return lower.startsWith("www.") ? lower.slice(4) : lower;
}

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function isSearchHost(host: string): boolean {
  return SEARCH_HOSTS.some((stem) =>
    stem.includes(".")
      ? matchesDomain(host, stem)
      : // `google` / `yandex`: any TLD (google.fr, google.co.uk) and subdomain.
        new RegExp(`(^|\\.)${stem}\\.[a-z.]+$`).test(host),
  );
}

/**
 * The channel of a visit. Campaign tags win (someone tagged that link on
 * purpose); then no referrer is Direct; then the closed search / social lists;
 * anything else is Referral.
 *
 * `referrerHost` is null when the visit had no referrer — including a
 * self-referral, which the server drops before calling this.
 */
export function channelOf(
  referrerHost: string | null,
  utm: UtmTags | undefined,
): Channel {
  if (utm && (utm.source || utm.medium || utm.campaign)) return "Campaign";
  if (referrerHost === null) return "Direct";
  const host = normalizeHost(referrerHost);
  if (isSearchHost(host)) return "Search";
  if (SOCIAL_HOSTS.some((domain) => matchesDomain(host, domain))) {
    return "Social";
  }
  return "Referral";
}
