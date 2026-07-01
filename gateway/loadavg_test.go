package main

import (
	"testing"
	"time"
)

func TestAdaptiveTimeoutFor(t *testing.T) {
	base := 15 * time.Second
	max := 90 * time.Second

	cases := []struct {
		name   string
		load1  float64
		numCPU int
		want   time.Duration
	}{
		{"idle stays at base", 0, 8, base},
		{"load below cores stays at base", 4, 8, base},
		{"load equal to cores stays at base", 8, 8, base},
		{"one full overcommit doubles", 16, 8, 30 * time.Second},
		{"half overcommit is 1.5x", 12, 8, 22500 * time.Millisecond},
		{"below ceiling scales linearly", 40, 8, 75 * time.Second},
		{"heavy load clamps to max", 100, 8, max},
		{"exactly at ceiling", 48, 8, max},
		{"numCPU floor guards divide-by-zero", 40, 0, max},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := adaptiveTimeoutFor(base, max, tc.load1, tc.numCPU)
			if got != tc.want {
				t.Errorf("adaptiveTimeoutFor(%s, %s, %v, %d) = %s; want %s",
					base, max, tc.load1, tc.numCPU, got, tc.want)
			}
		})
	}
}

// hostLoad1 must be fail-safe: it returns a value only when it can read the
// host load, never panics, and on the current platform either reports a
// non-negative load or ok=false.
func TestHostLoad1FailSafe(t *testing.T) {
	load, ok := hostLoad1()
	if ok && load < 0 {
		t.Errorf("hostLoad1() reported ok with negative load %v", load)
	}
}
