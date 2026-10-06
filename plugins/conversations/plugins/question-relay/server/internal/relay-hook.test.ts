import { describe, expect, test } from "bun:test";
import { isAbsolute } from "node:path";
import { relayHookEntry } from "./relay-hook";

describe("relayHookEntry", () => {
  test("runs the relay script beside this code, by absolute path", async () => {
    const entry = relayHookEntry();
    const path = /^bun "(.+)"$/.exec(entry.command)?.[1];
    expect(path).toBeDefined();
    expect(isAbsolute(path!)).toBe(true);
    expect(await Bun.file(path!).exists()).toBe(true);
    expect(path!.endsWith("/question-relay/bin/ask-relay.ts")).toBe(true);
  });
});
