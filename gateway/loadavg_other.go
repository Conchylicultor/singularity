//go:build !linux && !darwin

package main

// hostLoad1 has no portable implementation on other platforms, so it always
// reports unavailable — callers then use the fixed base timeout. Keeping this
// stub lets the gateway build everywhere.
func hostLoad1() (float64, bool) {
	return 0, false
}
