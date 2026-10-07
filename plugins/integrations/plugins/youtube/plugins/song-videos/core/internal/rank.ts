import type { SongQuery, VideoCandidate } from "./candidate";
import { foldText, keyTokens, normalizeSongKey } from "./song-key";

// ── Which video is the song's recording? ─────────────────────────────────────
//
// What is wanted is the studio recording: what a chord sheet transcribes, and
// what aligns best (a music video adds intros and skits, a live take moves the
// tempo and the arrangement). So the order is: a human-synced video first, then
// the label's art track ("<Artist> - Topic"), "Official Audio", the official
// video, and other uploads last — each only when its title and channel name the
// song. The weights are additive and documented one by one in `RANK_WEIGHTS`.

/** Each term of a candidate's score. Exported so tests and logs speak the same units. */
export const RANK_WEIGHTS = {
  /** × the share of the song title's words the video's title and channel hold. */
  titleMatch: 2,
  /** × the share of the artist's words they hold (1 when the channel IS the artist). */
  artistMatch: 1,
  /** − × the share of the video title's words that are neither the song's nor the artist's. */
  extraWords: 0.75,
  /** The label's auto-generated art track: the studio audio itself. */
  artTrack: 1,
  /** "Official Audio" in the title. */
  officialAudio: 0.7,
  /** "Official (Music) Video" in the title. */
  officialVideo: 0.5,
  /** Uploaded by the artist's own channel (verified or VEVO, named as the artist). */
  artistChannel: 0.3,
  /** − per version term (live, cover, remix…) the song's own name lacks. */
  versionTerm: 1,
  /** − when the duration is more than `DURATION_TOLERANCE` off the candidates' median. */
  durationOutlier: 0.5,
  /** A person synced this song's chords to the video. */
  humanSynced: 2,
  /** + × log10(views) / 9: a tie-breaker, 1 billion views ≈ the full weight. */
  views: 0.2,
  /** − × the best position any source listed it at. */
  sourceRank: 0.02,
} as const;

/** How far off the candidates' median a duration may be before it is an outlier. */
export const DURATION_TOLERANCE = 0.25;
/** Fewer durations than this give no median worth judging by. */
const MIN_DURATIONS_FOR_MEDIAN = 3;

/**
 * Words that mark a video as another version of the song. Each costs
 * `versionTerm` — unless the song's own name has it ("Wonderwall (Live)").
 */
export const VERSION_TERMS = [
  "live",
  "cover",
  "remix",
  "sped up",
  "slowed",
  "karaoke",
  "acoustic",
  // a-ha's "Take On Me (MTV Unplugged / Edit)" ranked third without it.
  "unplugged",
  "demo",
  "instrumental",
  "8d",
  "reaction",
  "tutorial",
  "lesson",
  "nightcore",
] as const;

const OFFICIAL_AUDIO = /\bofficial\s+audio\b/;
const OFFICIAL_VIDEO = /\bofficial\s+(?:music\s+|hd\s+|4k\s+)?video\b/;
const TOPIC_CHANNEL = / - topic$/;
const VEVO = /vevo$/;

/** A candidate with its score and what made it, best first. */
export interface RankedCandidate extends VideoCandidate {
  /** The sum of the terms below; only the order it gives means anything. */
  match: number;
  /** Each non-zero term, e.g. `["title 1.00", "art track", "live −1"]`. */
  reasons: string[];
}

function hasTerm(foldedText: string, term: string): boolean {
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${term.replace(/ /g, "\\s+")}(?:$|[^\\p{L}\\p{N}])`,
    "u",
  ).test(foldedText);
}

function share(wanted: readonly string[], have: ReadonlySet<string>): number {
  if (wanted.length === 0) return 0;
  return wanted.filter((t) => have.has(t)).length / wanted.length;
}

const compact = (key: string) => key.replace(/ /g, "");

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const fmt = (n: number) => n.toFixed(2);

function scoreCandidate(
  query: SongQuery,
  c: VideoCandidate,
  medianDuration: number | null,
): { match: number; reasons: string[] } {
  const reasons: string[] = [];
  let match = 0;
  const add = (value: number, reason: string) => {
    if (value === 0) return;
    match += value;
    reasons.push(reason);
  };

  const artistKey = normalizeSongKey(query.artist);
  const titleKey = normalizeSongKey(query.title);
  const artistWords = keyTokens(artistKey);
  const titleWords = keyTokens(titleKey);

  const rawTitle = foldText(c.title ?? "");
  const rawChannel = foldText(c.channel ?? "").trim();
  const channelName = rawChannel.replace(TOPIC_CHANNEL, "").replace(VEVO, "");
  const videoTitleWords = keyTokens(normalizeSongKey(c.title ?? ""));
  const channelKey = normalizeSongKey(channelName);
  const have = new Set([...videoTitleWords, ...keyTokens(channelKey)]);

  // ── Does it name the song? ──
  const titleShare = share(titleWords, have);
  add(RANK_WEIGHTS.titleMatch * titleShare, `title ${fmt(titleShare)}`);
  // "OasisVEVO", "rickastleyVEVO": the artist written as one word.
  const channelIsArtist =
    artistKey !== "" && compact(channelKey) === compact(artistKey);
  const artistShare =
    channelIsArtist ||
    (artistKey !== "" &&
      compact(normalizeSongKey(c.title ?? "")).includes(compact(artistKey)))
      ? 1
      : share(artistWords, have);
  add(RANK_WEIGHTS.artistMatch * artistShare, `artist ${fmt(artistShare)}`);
  if (videoTitleWords.length > 0) {
    const known = new Set([...titleWords, ...artistWords]);
    const extra =
      videoTitleWords.filter((t) => !known.has(t)).length /
      videoTitleWords.length;
    add(-RANK_WEIGHTS.extraWords * extra, `extra words ${fmt(extra)}`);
  }

  // ── What kind of upload? ──
  if (c.artTrack || TOPIC_CHANNEL.test(rawChannel)) {
    add(RANK_WEIGHTS.artTrack, "art track");
  } else if (OFFICIAL_AUDIO.test(rawTitle)) {
    add(RANK_WEIGHTS.officialAudio, "official audio");
  } else if (OFFICIAL_VIDEO.test(rawTitle)) {
    add(RANK_WEIGHTS.officialVideo, "official video");
  }
  if (channelIsArtist && (c.channelVerified || VEVO.test(rawChannel))) {
    add(RANK_WEIGHTS.artistChannel, "artist's channel");
  }

  // ── Another version of the song? ──
  const songName = foldText(query.title);
  for (const term of VERSION_TERMS) {
    if (hasTerm(rawTitle, term) && !hasTerm(songName, term)) {
      add(-RANK_WEIGHTS.versionTerm, term);
    }
  }
  if (
    medianDuration !== null &&
    c.durationSec !== null &&
    Math.abs(c.durationSec - medianDuration) / medianDuration >
      DURATION_TOLERANCE
  ) {
    add(-RANK_WEIGHTS.durationOutlier, "duration outlier");
  }

  // ── What the sources say ──
  if (c.sources.some((s) => s.evidence === "human-synced")) {
    add(RANK_WEIGHTS.humanSynced, "human-synced");
  }
  if (c.viewCount !== null && c.viewCount > 0) {
    const views = Math.min(1, Math.log10(c.viewCount) / 9);
    add(RANK_WEIGHTS.views * views, `views ${fmt(views)}`);
  }
  const bestRank = Math.min(...c.sources.map((s) => s.rank));
  add(-RANK_WEIGHTS.sourceRank * bestRank, `position ${bestRank}`);

  return { match, reasons };
}

/**
 * The candidates in the order they should be tried: best first. Pure; a tie
 * keeps the given order.
 *
 * - **Kind**: art track ("<Artist> - Topic") > "Official Audio" > "Official
 *   (Music) Video" > other uploads; an upload by the artist's own channel is
 *   a little better.
 * - **Version**: each of `VERSION_TERMS` in the title costs, unless the song's
 *   own name has it.
 * - **Match**: the token-set share of the song title and of the artist found
 *   in the video's title and channel, less the title's extra words.
 * - **Duration**: more than 25 % off the candidates' median (with at least
 *   three durations known) costs.
 * - **Evidence**: a human-synced video (a Hooktheory transcription) gets a
 *   strong bonus.
 */
export function rankCandidates(
  query: SongQuery,
  candidates: readonly VideoCandidate[],
): RankedCandidate[] {
  const durations = candidates
    .map((c) => c.durationSec)
    .filter((d): d is number => d !== null && d > 0);
  const medianDuration =
    durations.length >= MIN_DURATIONS_FOR_MEDIAN ? median(durations) : null;
  return candidates
    .map((c, i) => ({ c, i, ...scoreCandidate(query, c, medianDuration) }))
    .sort((a, b) => b.match - a.match || a.i - b.i)
    .map(({ c, match, reasons }) => ({ ...c, match, reasons }));
}
