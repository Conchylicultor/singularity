import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  pluginLoadReportSink,
  type PluginLoadReport,
} from "./deferred-load-store";

const warn = spyOn(console, "warn").mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

function failure(i: number): PluginLoadReport {
  return { pluginPath: `p${i}`, message: `m${i}` };
}

// The sink is a module singleton: register(null) both detaches the handler and
// discards anything held, so each case starts empty.
afterEach(() => {
  pluginLoadReportSink.register(null);
  warn.mockClear();
});

describe("pluginLoadReportSink", () => {
  test("holds failures emitted before the reporter registers, then replays them in order", () => {
    // App.tsx emits the core-stage failures right after its first setState,
    // before the reporter's mount effect has registered.
    pluginLoadReportSink.emit(failure(1));
    pluginLoadReportSink.emit(failure(2));
    const seen: PluginLoadReport[] = [];
    pluginLoadReportSink.register((r) => seen.push(r));
    expect(seen).toEqual([failure(1), failure(2)]);
  });

  test("delivers straight through once the reporter is registered", () => {
    const seen: PluginLoadReport[] = [];
    pluginLoadReportSink.register((r) => seen.push(r));
    pluginLoadReportSink.emit(failure(1));
    expect(seen).toEqual([failure(1)]);
  });

  test("keeps the first 100 held failures, drops newer ones and warns once", () => {
    for (let i = 0; i < 105; i++) pluginLoadReportSink.emit(failure(i));
    expect(warn).toHaveBeenCalledTimes(1);
    const seen: PluginLoadReport[] = [];
    pluginLoadReportSink.register((r) => seen.push(r));
    expect(seen).toHaveLength(100);
    expect(seen[0]).toEqual(failure(0));
    expect(seen.at(-1)).toEqual(failure(99));
  });

  test("swallows a throwing reporter, on replay and on direct delivery", () => {
    const seen: string[] = [];
    pluginLoadReportSink.emit(failure(1));
    const handler = (r: PluginLoadReport) => {
      seen.push(r.pluginPath);
      throw new Error("boom");
    };
    expect(() => pluginLoadReportSink.register(handler)).not.toThrow();
    expect(() => pluginLoadReportSink.emit(failure(2))).not.toThrow();
    expect(seen).toEqual(["p1", "p2"]);
  });
});
