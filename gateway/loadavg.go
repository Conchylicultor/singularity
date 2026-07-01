package main

import (
	"runtime"
	"time"
)

// Load-adaptive readiness timeout.
//
// A backend boots correctly but completes its readiness barrier (migrations, DB
// warm, registry build) in wall-clock time that scales with host contention.
// Under a load spike (many concurrent worktree builds, load average 40+) a
// fixed timeout misfires: the barrier legitimately exceeds it, waitReady
// returns an error, and the failure path SIGKILLs a healthy backend. Scaling
// the timeout with host load removes the during-build reap while `exitCh` still
// short-circuits a real crash instantly, so a generous ceiling never delays
// crash detection.

// adaptiveTimeout scales base by current host load, clamped to [base, max].
// When the host load is unavailable (unsupported OS or read error) it is
// fail-safe: it returns base, i.e. the pre-existing fixed behavior.
func adaptiveTimeout(base, max time.Duration) time.Duration {
	load1, ok := hostLoad1()
	if !ok {
		return base
	}
	return adaptiveTimeoutFor(base, max, load1, runtime.NumCPU())
}

// adaptiveTimeoutFor is the pure clamping math, split out so it is unit-testable
// without reading the real host. factor = 1 + max(0, load1-numCPU)/numCPU: the
// timeout stays at base until the 1-minute load exceeds the core count, then
// grows linearly with the per-core overcommit, capped at max.
func adaptiveTimeoutFor(base, max time.Duration, load1 float64, numCPU int) time.Duration {
	if numCPU < 1 {
		numCPU = 1
	}
	over := load1 - float64(numCPU)
	if over < 0 {
		over = 0
	}
	factor := 1 + over/float64(numCPU)
	scaled := time.Duration(float64(base) * factor)
	if scaled < base {
		return base
	}
	if scaled > max {
		return max
	}
	return scaled
}
