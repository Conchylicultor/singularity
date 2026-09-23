import { describe, expect, it } from "bun:test";
import { LET_IT_BE_VERSE } from "../../core/testing";
import { PublicSongEnvelopeSchema, sectionFromEnvelope } from "./section";

// The document decoding itself is tested next to `sectionFromHookpadDoc` in
// core; this covers only what the envelope adds: the second JSON layer.

const ID = "_NgbRXeYgQA";

function parse(body: unknown) {
  return sectionFromEnvelope(ID, PublicSongEnvelopeSchema.parse(body));
}

describe("sectionFromEnvelope", () => {
  it("decodes the captured Let It Be verse through its jsonData string", () => {
    const section = parse(LET_IT_BE_VERSE);
    expect(section.id).toBe(ID);
    expect(section.song).toBe("Let It Be");
    expect(section.chords).toHaveLength(12);
    expect(section.youtube.videoId).toBe("CGj85pVzRJs");
  });

  it("throws on jsonData that is not JSON", () => {
    expect(() =>
      parse({ ...LET_IT_BE_VERSE, jsonData: '{"chords":[' }),
    ).toThrow(/TheoryTab section _NgbRXeYgQA: jsonData is not valid JSON/);
  });

  it("throws on a document of the wrong shape, naming the section", () => {
    expect(() => parse({ ...LET_IT_BE_VERSE, jsonData: "[]" })).toThrow(
      /TheoryTab section _NgbRXeYgQA document did not match the expected shape/,
    );
  });

  it("rejects an envelope without jsonData", () => {
    const { ID: numericId, song } = LET_IT_BE_VERSE;
    expect(() =>
      PublicSongEnvelopeSchema.parse({ ID: numericId, song }),
    ).toThrow(/jsonData/);
  });
});
