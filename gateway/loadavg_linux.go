//go:build linux

package main

import (
	"os"
	"strconv"
	"strings"
)

// hostLoad1 returns the 1-minute host load average on Linux by reading the
// first field of /proc/loadavg. Fail-safe: any read/parse error yields
// ok=false so callers fall back to the fixed base timeout.
func hostLoad1() (float64, bool) {
	data, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0, false
	}
	fields := strings.Fields(string(data))
	if len(fields) == 0 {
		return 0, false
	}
	load1, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0, false
	}
	return load1, true
}
