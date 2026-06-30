package main

import (
	"os"
	"path/filepath"
	"testing"
)

// newTestRegistry builds a Registry rooted at fresh temp dirs. LogBufferLines is
// nonzero so NewWorktree's log ring is valid; the rotating log writer opens lazily
// so no FD is held by merely registering a worktree.
func newTestRegistry(t *testing.T) (*Registry, string) {
	t.Helper()
	regDir := t.TempDir()
	// SocketsDir must be short: NewWorktree rejects worktrees whose <name>.next.sock
	// path exceeds 104 bytes, and the default macOS $TMPDIR ($t.TempDir) is far too
	// long. Use a short /tmp dir, matching sockets_test.go.
	sockDir, err := os.MkdirTemp("/tmp", "gwreg")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(sockDir) })
	cfg := &Config{
		RegistryDir:    regDir,
		SocketsDir:     sockDir,
		LogDir:         t.TempDir(),
		LogBufferLines: 16,
	}
	return NewRegistry(cfg), regDir
}

// writeSpec writes a <regDir>/<name>/spec.json with an absolute server path
// (loadSpec requires server to be absolute) and creates that server dir on disk —
// loadFile rejects a spec whose backing server dir is missing (serverPathMissing),
// so the fixture must materialize it for the worktree to register.
func writeSpec(t *testing.T, regDir, name string) {
	t.Helper()
	sub := filepath.Join(regDir, name)
	server := filepath.Join(sub, "server")
	if err := os.MkdirAll(server, 0o755); err != nil {
		t.Fatal(err)
	}
	body := `{"server":"` + server + `"}`
	if err := os.WriteFile(filepath.Join(sub, "spec.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// Resolve must load a worktree from disk on demand when its spec.json exists but
// the in-memory registry never saw a create event — the exact FD-pressure case.
func TestResolveLoadsSpecFromDisk(t *testing.T) {
	reg, regDir := newTestRegistry(t)
	writeSpec(t, regDir, "alpha")

	if reg.Get("alpha") != nil {
		t.Fatal("alpha should not be registered before Resolve")
	}
	if wt := reg.Resolve("alpha"); wt == nil {
		t.Fatal("Resolve should load alpha from disk")
	}
	if reg.Get("alpha") == nil {
		t.Fatal("Resolve should have registered alpha in-memory")
	}
	// A name with no spec on disk, and an invalid name, both resolve to nil.
	if reg.Resolve("ghost") != nil {
		t.Fatal("Resolve of a missing spec should be nil")
	}
	if reg.Resolve("Bad_Name") != nil {
		t.Fatal("Resolve of an invalid name should be nil")
	}
}

// reconcileOnce must register specs the watch missed and unregister worktrees
// whose backing dir vanished.
func TestReconcileRegistersAndUnregisters(t *testing.T) {
	reg, regDir := newTestRegistry(t)
	writeSpec(t, regDir, "alpha")
	writeSpec(t, regDir, "beta")

	reg.reconcileOnce()
	if reg.Get("alpha") == nil || reg.Get("beta") == nil {
		t.Fatal("reconcile should register both on-disk worktrees")
	}

	// Remove beta's dir; reconcile should drop it (worktree-cleanup case).
	if err := os.RemoveAll(filepath.Join(regDir, "beta")); err != nil {
		t.Fatal(err)
	}
	reg.reconcileOnce()
	if reg.Get("alpha") == nil {
		t.Fatal("reconcile must keep alpha (dir still present)")
	}
	if reg.Get("beta") != nil {
		t.Fatal("reconcile must unregister beta after its dir was removed")
	}
}

// reconcileOnce must ignore flat .json files that share the registry dir — stray
// build-profile/build-logs profiling artifacts and leftover flat legacy specs.
// The legacy flat-spec layout was retired: only <name>/spec.json subdirs are
// worktrees. Re-parsing these flat files as specs every tick is what produced the
// "failed to load legacy spec" warn-flood this guards against.
func TestReconcileIgnoresFlatJSON(t *testing.T) {
	reg, regDir := newTestRegistry(t)
	writeSpec(t, regDir, "alpha")

	// A non-spec profiling artifact: parses as JSON but has no server field.
	if err := os.WriteFile(
		filepath.Join(regDir, "att-123-build-profile.json"),
		[]byte(`{"spans":[],"totalDurationMs":0}`), 0o644,
	); err != nil {
		t.Fatal(err)
	}
	// A *valid* flat legacy spec with an existing server dir — under the old
	// behavior this would have registered "legacy"; after retirement it must not.
	legacyServer := filepath.Join(regDir, "legacy-server")
	if err := os.MkdirAll(legacyServer, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(regDir, "legacy.json"),
		[]byte(`{"server":"`+legacyServer+`"}`), 0o644,
	); err != nil {
		t.Fatal(err)
	}

	reg.reconcileOnce()

	if reg.Get("alpha") == nil {
		t.Fatal("reconcile must still register the subdir worktree alpha")
	}
	if reg.Get("att-123-build-profile") != nil {
		t.Fatal("a flat build-profile artifact must never register as a worktree")
	}
	if reg.Get("legacy") != nil {
		t.Fatal("a flat legacy spec must no longer register (legacy scan retired)")
	}
}
