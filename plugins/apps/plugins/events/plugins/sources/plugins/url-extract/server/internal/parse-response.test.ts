import { describe, expect, test } from "bun:test";
import { parseExtractionResponse } from "./parse-response";

// The parser is the boundary between a model's free text and the engine's typed
// input, so the two things worth asserting are: it tolerates the ways a model
// legitimately dresses up valid JSON, and it THROWS — never returns [] — on
// anything it cannot vouch for. `[]` means "the page lists no events", and the
// engine acts on that by stamping every previously-found event as disappeared.

const EVENT = {
  title: "Techno Thursdays",
  startsAt: "2026-08-06T23:00:00+02:00",
  category: "club",
  venue: "Fitzroy",
  price: "Free before midnight",
  recurring: true,
  recurrenceLabel: "every Thursday",
  seriesKey: "techno-thursdays",
};

describe("parseExtractionResponse", () => {
  test("parses a bare JSON array", () => {
    const events = parseExtractionResponse(JSON.stringify([EVENT]));
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Techno Thursdays");
    // `z.coerce.date()` — the wire carries ISO strings, the engine gets Dates.
    expect(events[0]?.startsAt).toBeInstanceOf(Date);
    expect(events[0]?.seriesKey).toBe("techno-thursdays");
  });

  test("parses an empty array as a legitimate 'no events' answer", () => {
    expect(parseExtractionResponse("[]")).toEqual([]);
  });

  test("parses an array inside a ```json fence", () => {
    const raw = `\`\`\`json\n${JSON.stringify([EVENT])}\n\`\`\``;
    expect(parseExtractionResponse(raw)).toHaveLength(1);
  });

  test("parses an array wrapped in prose", () => {
    const raw = `Here are the events I found:\n\n${JSON.stringify([EVENT])}\n\nLet me know if you need more.`;
    expect(parseExtractionResponse(raw)).toHaveLength(1);
  });

  test("is not fooled by a bracket inside a title", () => {
    const events = parseExtractionResponse(
      `${JSON.stringify([{ ...EVENT, title: 'Techno [Night] "live"' }])} — done.`,
    );
    expect(events[0]?.title).toBe('Techno [Night] "live"');
  });

  test("throws on a response carrying no array at all", () => {
    expect(() => parseExtractionResponse("I could not find any events.")).toThrow(
      /no JSON array/,
    );
  });

  test("throws on a truncated array", () => {
    expect(() => parseExtractionResponse(`[{"title": "x"`)).toThrow(
      /unterminated JSON array/,
    );
  });

  test("throws on malformed JSON, carrying the raw output", () => {
    expect(() =>
      parseExtractionResponse(`[{title: 'Techno', startsAt: tomorrow}]`),
    ).toThrow(/not valid JSON.*title: 'Techno'/s);
  });

  test("throws when an event misses a required key", () => {
    expect(() =>
      parseExtractionResponse(JSON.stringify([{ title: "No date here" }])),
    ).toThrow(/did not match the event schema/);
  });

  test("throws on a category outside the closed list", () => {
    expect(() =>
      parseExtractionResponse(JSON.stringify([{ ...EVENT, category: "rave" }])),
    ).toThrow(/did not match the event schema/);
  });

  test("failures are terminal, so the engine dead-letters instead of re-paying", () => {
    expect(() => parseExtractionResponse("nothing here")).toThrow(
      expect.objectContaining({ name: "NonRetryableError" }),
    );
  });
});
