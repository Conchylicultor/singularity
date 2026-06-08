#!/usr/bin/env bun
import { runHook } from "../core/runner";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const raw = Buffer.concat(chunks).toString("utf8");

let input: unknown = {};
if (raw.trim()) {
  try {
    input = JSON.parse(raw);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    // malformed input — allow (don't block tool use on parse failure)
    process.exit(0);
  }
}

await runHook(input as Parameters<typeof runHook>[0]);
