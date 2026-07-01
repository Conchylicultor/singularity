//go:build darwin

package main

import (
	"encoding/binary"

	"golang.org/x/sys/unix"
)

// hostLoad1 returns the 1-minute host load average on darwin via the
// `vm.loadavg` sysctl. The raw bytes are a `struct loadavg`:
//
//	struct loadavg { fixpt_t ldavg[3]; long fscale; };
//
// where fixpt_t is a uint32 fixed-point value and fscale is the scaling
// divisor. On 64-bit darwin `long` is an 8-byte, 8-byte-aligned field, so the
// three uint32s (12 bytes) are followed by 4 bytes of padding and fscale lands
// at offset 16. load1 = float64(ldavg[0]) / float64(fscale). Fail-safe: any
// error yields ok=false so callers fall back to the fixed base timeout.
func hostLoad1() (float64, bool) {
	buf, err := unix.SysctlRaw("vm.loadavg")
	if err != nil {
		return 0, false
	}
	// Need ldavg[0] at offset 0 and fscale at offset 16 (both read as
	// little-endian uint32 — fscale's value fits in 32 bits regardless of the
	// 8-byte `long` storage on LP64).
	if len(buf) < 20 {
		return 0, false
	}
	ldavg0 := binary.LittleEndian.Uint32(buf[0:4])
	fscale := binary.LittleEndian.Uint32(buf[16:20])
	if fscale == 0 {
		return 0, false
	}
	return float64(ldavg0) / float64(fscale), true
}
