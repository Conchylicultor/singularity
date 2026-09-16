import { afterEach, describe, expect, test } from "bun:test";
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
    );
    expect(path).toBe("/s/att-1.sock");
    expect(servingSocketPath()).toBe("/s/att-1.sock");
  });

  test("a --socket flag with no value throws", () => {
    expect(() => readServingSocket(argv("--socket"))).toThrow(/no value/);
    expect(() =>
      readServingSocket(argv("--socket", "--namespace", "x")),
    ).toThrow(/no value/);
  });

  test("no --socket throws, even with the retired SOCKET_PATH in the environment", () => {
    const prev = process.env.SOCKET_PATH;
    process.env.SOCKET_PATH = "/s/legacy.sock";
    try {
      expect(() => readServingSocket(argv("--namespace", "att-1"))).toThrow(
        /spawned without --socket/,
      );
    } finally {
      if (prev === undefined) delete process.env.SOCKET_PATH;
      else process.env.SOCKET_PATH = prev;
    }
  });

  test("a second, different socket throws; the same one is fine", () => {
    readServingSocket(argv("--socket", "/s/a.sock"));
    expect(readServingSocket(argv("--socket", "/s/a.sock"))).toBe("/s/a.sock");
    expect(() => readServingSocket(argv("--socket", "/s/b.sock"))).toThrow(
      /cannot be redeclared/,
    );
  });
});

test("servingSocketPath throws in a process that serves nothing", () => {
  expect(() => servingSocketPath()).toThrow(/serves on no socket/);
});
