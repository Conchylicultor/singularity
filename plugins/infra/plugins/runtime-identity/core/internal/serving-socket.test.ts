import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  readServingSocket,
  resetServingSocketForTest,
  servingSocketPath,
} from "./serving-socket";

afterEach(() => {
  resetServingSocketForTest();
});

const argv = (...rest: string[]) => ["bun", "bin/index.ts", ...rest];

describe("readServingSocket", () => {
  test("reads --socket from argv and records it", () => {
    const path = readServingSocket(
      argv("--namespace", "att-1", "--socket", "/s/att-1.sock"),
      {},
    );
    expect(path).toBe("/s/att-1.sock");
    expect(servingSocketPath()).toBe("/s/att-1.sock");
  });

  test("argv wins over the legacy environment variable", () => {
    const path = readServingSocket(argv("--socket", "/s/new.sock"), {
      SOCKET_PATH: "/s/stale.sock",
    });
    expect(path).toBe("/s/new.sock");
  });

  test("a --socket flag with no value throws", () => {
    expect(() => readServingSocket(argv("--socket"), {})).toThrow(/no value/);
    expect(() =>
      readServingSocket(argv("--socket", "--namespace", "x"), {}),
    ).toThrow(/no value/);
  });

  test("falls back to the environment, with a warning, when the gateway sent no --socket", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const path = readServingSocket(argv("--namespace", "att-1"), {
        SOCKET_PATH: "/s/legacy.sock",
      });
      expect(path).toBe("/s/legacy.sock");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("./singularity start");
    } finally {
      warn.mockRestore();
    }
  });

  test("neither argv nor the environment throws", () => {
    expect(() => readServingSocket(argv("--namespace", "att-1"), {})).toThrow(
      /spawned without --socket/,
    );
  });

  test("a second, different socket throws; the same one is fine", () => {
    readServingSocket(argv("--socket", "/s/a.sock"), {});
    expect(readServingSocket(argv("--socket", "/s/a.sock"), {})).toBe(
      "/s/a.sock",
    );
    expect(() => readServingSocket(argv("--socket", "/s/b.sock"), {})).toThrow(
      /cannot be redeclared/,
    );
  });
});

test("servingSocketPath throws in a process that serves nothing", () => {
  expect(() => servingSocketPath()).toThrow(/serves on no socket/);
});
