import { z } from "zod";
import {
  ChordIdSchema,
  HooktheoryApiError,
  HooktheorySectionNotFoundError,
  ProgressionSchema,
  TheorytabSectionIdSchema,
  TrendSongSchema,
  type TheorytabSection,
  type TrendNode,
  type TrendSong,
} from "../../core";
import { hooktheoryFetch } from "./request";
import {
  PublicSongEnvelopeSchema,
  sectionFromEnvelope,
  type PublicSongEnvelope,
} from "./section";

/** `/trends/nodes` as Hooktheory spells it; renamed to camelCase below. */
const TrendNodeWireSchema = z.object({
  chord_ID: ChordIdSchema,
  chord_HTML: z.string(),
  probability: z.number(),
  child_path: z.string(),
});

/**
 * The chords that most often come next after `progression`, with Hooktheory's
 * probability for each. An empty progression asks for the chords songs most
 * often START on. Needs a signed-in Hooktheory account.
 */
export async function getTrendNodes(
  progression: readonly string[],
): Promise<TrendNode[]> {
  const cp = ProgressionSchema.parse(progression).join(",");
  const nodes = await hooktheoryFetch("/trends/nodes", {
    auth: true,
    query: cp === "" ? {} : { cp },
    schema: z.array(TrendNodeWireSchema),
  });
  return nodes.map((n) => ({
    chordId: n.chord_ID,
    chordHtml: n.chord_HTML,
    probability: n.probability,
    childPath: n.child_path,
  }));
}

/**
 * Songs containing `progression`, one page at a time (`page` from 1). Needs a
 * signed-in Hooktheory account. The row shape is Hooktheory's documented one,
 * unconfirmed live — see this plugin's CLAUDE.md.
 */
export async function getTrendSongs(
  progression: readonly string[],
  page: number,
): Promise<TrendSong[]> {
  const cp = ProgressionSchema.min(1).parse(progression).join(",");
  const pageNumber = z.number().int().min(1).parse(page);
  return hooktheoryFetch("/trends/songs", {
    auth: true,
    query: { cp, page: String(pageNumber) },
    schema: z.array(TrendSongSchema),
  });
}

/**
 * One TheoryTab section — chords, melody, key / tempo / meter, and where it
 * sits in its YouTube recording. Public: no account needed. Throws
 * `HooktheorySectionNotFoundError` for an id Hooktheory does not know.
 */
export async function getTheorytabSection(
  id: string,
): Promise<TheorytabSection> {
  const sectionId = TheorytabSectionIdSchema.parse(id);
  let envelope: PublicSongEnvelope;
  try {
    envelope = await hooktheoryFetch(`/songs/public/${sectionId}`, {
      auth: false,
      query: { fields: "ID,song,jsonData" },
      schema: PublicSongEnvelopeSchema,
    });
  } catch (err) {
    // Hooktheory answers every unknown id with a 400 "The provided hash … could
    // not be decoded", never a 404 — name that case once, here.
    if (
      err instanceof HooktheoryApiError &&
      err.status === 400 &&
      /could not be decoded/i.test(err.message)
    ) {
      throw new HooktheorySectionNotFoundError(
        sectionId,
        err.status,
        err.message,
      );
    }
    throw err;
  }
  return sectionFromEnvelope(sectionId, envelope);
}
