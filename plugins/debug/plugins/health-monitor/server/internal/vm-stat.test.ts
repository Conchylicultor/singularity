import { describe, expect, test } from "bun:test";
import { parseVmStat } from "./vm-stat";

// Trimmed real `vm_stat` output (Apple Silicon, 16 KB pages) — every counter
// the host sampler reads, plus a multi-word key with parentheses to exercise
// the line regex.
const FIXTURE = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               12862.
Pages active:                            827392.
Pages occupied by compressor:            655360.
File-backed pages:                       301234.
Pageins:                               12345678.
Swapins:                                 424242.
Swapouts:                                515151.
Compressions:                         123456789.
Decompressions:                        98765432.
`;

describe("parseVmStat", () => {
  test("parses page size and the sampler's counters", () => {
    const vm = parseVmStat(FIXTURE);
    expect(vm.pageSize).toBe(16384);
    expect(vm.map["Swapins"]).toBe(424242);
    expect(vm.map["Swapouts"]).toBe(515151);
    expect(vm.map["Compressions"]).toBe(123456789);
    expect(vm.map["Decompressions"]).toBe(98765432);
    expect(vm.map["Pages occupied by compressor"]).toBe(655360);
  });

  test("defaults page size to 16384 when the header is absent", () => {
    const vm = parseVmStat("Compressions: 10.\n");
    expect(vm.pageSize).toBe(16384);
    expect(vm.map["Compressions"]).toBe(10);
  });
});
