// ── The worktree sample: a fixed ~5 % of songs, plus sections tests rely on ──
//
// A worktree loads a sample instead of the whole index. The rule is fixed, so
// every worktree gets the same songs: a song is in when its artist + song slugs
// hash into bucket 0 of 20, and then ALL its sections are (the hash is over the
// song, never the section). On the pinned dump that is 1,342 sections from 788
// songs. On top, `SAMPLE_PINNED_SECTIONS` are always loaded, so a test or e2e
// script never depends on which songs the hash happened to pick.

export const SAMPLE_BUCKETS = 20;

/**
 * Sections always in the sample, each for the case it covers. Chosen from the
 * pinned processed file; extend it when a test needs another case.
 */
export const SAMPLE_PINNED_SECTIONS: Readonly<Record<string, string>> = {
  nJmBkqjkgAV: "key changes (3 keys over 132 beats), per-beat alignment",
  KexEQzOVx_B: "a key change every 8 beats: no 4-bar window fits in one key",
  JNgqRQdrxrz: "6/8 (Queen, Bohemian Rhapsody), start/end alignment only",
  DpgvlyYOoad: "meter changes (4/4, 5/4, 2/4, 3/4)",
  AnLgaeR_gYp: "gaps in the harmony (rests) inside 4/4 bars",
};

/**
 * 32-bit FNV-1a over the UTF-8 bytes. Chosen for being tiny, pure and the same
 * in every runtime — the sample must not change with a platform's hash.
 */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** The song's bucket, 0 to `SAMPLE_BUCKETS − 1`. */
export function sampleBucket(song: {
  artistSlug: string;
  songSlug: string;
}): number {
  return fnv1a32(`${song.artistSlug}\n${song.songSlug}`) % SAMPLE_BUCKETS;
}

/** Whether a section belongs to the worktree sample. */
export function isInSample(section: {
  id: string;
  artistSlug: string;
  songSlug: string;
}): boolean {
  return (
    Object.hasOwn(SAMPLE_PINNED_SECTIONS, section.id) ||
    sampleBucket(section) === 0
  );
}
