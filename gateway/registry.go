package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

var nameRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)

// Registry is the in-memory collection of worktrees, populated from JSON
// files in cfg.RegistryDir and kept in sync via fsnotify.
type Registry struct {
	cfg *Config

	mu     sync.RWMutex
	byName map[string]*Worktree
}

func NewRegistry(cfg *Config) *Registry {
	return &Registry{
		cfg:    cfg,
		byName: make(map[string]*Worktree),
	}
}

// HasName reports whether a worktree with the given name is registered.
// Used by reconcileOrphanBackends to classify orphan socket files.
func (r *Registry) HasName(name string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.byName[name]
	return ok
}

// Get returns the worktree with the given name, or nil if absent. Pure
// in-memory lookup — never touches disk.
func (r *Registry) Get(name string) *Worktree {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.byName[name]
}

// Resolve returns the worktree for name, registering it on demand from disk if a
// spec.json exists but the in-memory registry has not caught it yet. This makes
// request routing correct independent of fsnotify health: under watch-FD pressure
// (thousands of worktree dirs) a create event can be dropped, but any worktree
// whose spec.json is on disk is still reachable on its first request. Returns nil
// for an invalid name or a name with no spec on disk. Idempotent and concurrency-
// safe: loadFile's upsert collapses concurrent loads to a single registration.
func (r *Registry) Resolve(name string) *Worktree {
	if wt := r.Get(name); wt != nil {
		return wt
	}
	if r.cfg.RegistryDir == "" || !nameRegex.MatchString(name) {
		return nil
	}
	specPath := filepath.Join(r.cfg.RegistryDir, name, "spec.json")
	if _, err := os.Stat(specPath); err != nil {
		return nil
	}
	r.loadFile(specPath)
	return r.Get(name)
}

// List returns a snapshot of all known worktrees.
func (r *Registry) List() []*Worktree {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Worktree, 0, len(r.byName))
	for _, w := range r.byName {
		out = append(out, w)
	}
	return out
}

// LoadAll scans cfg.RegistryDir once at startup, populating the registry.
// Supports two layouts:
//   - new: <name>/spec.json  (subdirectory per worktree)
//   - legacy: <name>.json    (flat file, written by old CLI versions)
//
// Creates the directory if missing.
func (r *Registry) LoadAll() error {
	if err := os.MkdirAll(r.cfg.RegistryDir, 0o755); err != nil {
		return fmt.Errorf("create registry dir: %w", err)
	}
	entries, err := os.ReadDir(r.cfg.RegistryDir)
	if err != nil {
		return fmt.Errorf("read registry dir: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() {
			specPath := filepath.Join(r.cfg.RegistryDir, e.Name(), "spec.json")
			if _, err := os.Stat(specPath); err == nil {
				r.loadFile(specPath)
			}
		} else if strings.HasSuffix(e.Name(), ".json") {
			r.loadLegacyFile(filepath.Join(r.cfg.RegistryDir, e.Name()))
		}
	}
	slog.Info("registry loaded", "count", len(r.byName), "dir", r.cfg.RegistryDir)
	return nil
}

// Watch blocks until ctx is done, keeping the registry in sync via a SINGLE
// fsnotify watch on the registry dir itself. It deliberately does NOT add a watch
// per worktree subdirectory: with thousands of worktree dirs that exhausts the
// kqueue/open-file budget on macOS, and a dropped per-subdir w.Add silently loses
// the worktree forever (the later spec.json write produces no observable event).
// Instead correctness is decoupled from the watch:
//
//   - the dir-level watch catches subdir create/remove for low-latency
//     register/unregister of new-format <name>/spec.json worktrees,
//   - legacy flat <name>.json files (direct children) are fully covered here, and
//   - Resolve loads a spec on demand on first request, while Reconcile
//     periodically re-scans the dir — so a worktree whose spec.json is written
//     *after* its dir is created (the build creates the dir early for logs and
//     writes spec.json last) is always picked up, by design.
//
// Writes are debounced 100ms to absorb non-atomic / partial writes.
func (r *Registry) Watch(ctx context.Context) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer w.Close()
	if err := w.Add(r.cfg.RegistryDir); err != nil {
		return err
	}

	debounce := make(map[string]*time.Timer)
	var debounceMu sync.Mutex

	for {
		select {
		case <-ctx.Done():
			return nil
		case ev, ok := <-w.Events:
			if !ok {
				return nil
			}

			// A new worktree subdir appeared. Its spec.json may already be present
			// (dev writes mkdir+spec back-to-back) — register it immediately. If
			// spec.json is written later, Reconcile/Resolve picks it up.
			if ev.Op&fsnotify.Create != 0 {
				if info, err := os.Stat(ev.Name); err == nil && info.IsDir() {
					specPath := filepath.Join(ev.Name, "spec.json")
					if _, serr := os.Stat(specPath); serr == nil {
						r.loadFile(specPath)
					}
					continue
				}
			}

			// A worktree subdir or legacy file disappeared — unregister it.
			if ev.Op&(fsnotify.Remove|fsnotify.Rename) != 0 {
				base := filepath.Base(ev.Name)
				if strings.HasSuffix(base, ".json") {
					r.remove(legacyNameFromPath(ev.Name))
				} else {
					r.remove(base) // bare subdir name
				}
				continue
			}

			// Legacy format: flat <name>.json created/written directly in the
			// registry dir. (New-format spec.json lives inside an unwatched subdir,
			// so it never reaches us here — handled by Reconcile/Resolve.)
			if filepath.Dir(ev.Name) == r.cfg.RegistryDir &&
				strings.HasSuffix(ev.Name, ".json") &&
				ev.Op&(fsnotify.Create|fsnotify.Write) != 0 {
				path := ev.Name
				debounceMu.Lock()
				if t, exists := debounce[path]; exists {
					t.Stop()
				}
				debounce[path] = time.AfterFunc(100*time.Millisecond, func() {
					r.loadLegacyFile(path)
				})
				debounceMu.Unlock()
			}
		case werr, ok := <-w.Errors:
			if !ok {
				return nil
			}
			slog.Warn("watcher error", "err", werr)
		}
	}
}

// Reconcile blocks until ctx is done, periodically re-scanning the registry dir to
// repair any drift the fsnotify watch missed. This is the backstop that makes
// registration correct under watch-FD pressure (the watch+reconcile informer
// pattern): it registers worktrees whose spec.json appeared without a delivered
// event, and unregisters worktrees whose backing dir/file was removed out from
// under us (e.g. by worktree-cleanup). fsnotify stays the low-latency fast path;
// this is the periodic safety net.
func (r *Registry) Reconcile(ctx context.Context) {
	t := time.NewTicker(r.cfg.ReconcileInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			r.reconcileOnce()
		}
	}
}

func (r *Registry) reconcileOnce() {
	entries, err := os.ReadDir(r.cfg.RegistryDir)
	if err != nil {
		slog.Warn("reconcile: read registry dir failed", "dir", r.cfg.RegistryDir, "err", err)
		return
	}
	present := make(map[string]bool, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			name := e.Name()
			present[name] = true
			// Already registered → skip the stat/load. Steady state hits this for
			// nearly every dir, so reconcile stays cheap even with thousands.
			if r.Get(name) != nil {
				continue
			}
			specPath := filepath.Join(r.cfg.RegistryDir, name, "spec.json")
			if _, serr := os.Stat(specPath); serr == nil {
				r.loadFile(specPath)
			}
		} else if strings.HasSuffix(e.Name(), ".json") {
			name := legacyNameFromPath(e.Name())
			present[name] = true
			if r.Get(name) == nil {
				r.loadLegacyFile(filepath.Join(r.cfg.RegistryDir, e.Name()))
			}
		}
	}
	// Unregister worktrees whose backing dir/file vanished. Keyed on dir/file
	// presence, NOT spec.json presence, so a non-atomic spec rewrite can never
	// transiently evict a live worktree.
	for _, wt := range r.List() {
		if !present[wt.Name] {
			slog.Info("reconcile: worktree dir gone, unregistering", "name", wt.Name)
			r.remove(wt.Name)
		}
	}
}

// Sweep blocks until ctx is done, periodically tearing down idle backends.
func (r *Registry) Sweep(ctx context.Context) {
	t := time.NewTicker(r.cfg.SweepInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			for _, wt := range r.List() {
				if wt.ShouldSweep(r.cfg.IdleTimeout) {
					slog.Info("sweeping idle worktree", "worktree", wt.Name)
					if err := wt.Stop(ctx); err != nil {
						slog.Warn("sweep stop failed", "worktree", wt.Name, "err", err)
					}
				}
			}
		}
	}
}

// StopAll stops every running worktree, called from main on shutdown.
func (r *Registry) StopAll(ctx context.Context) error {
	var wg sync.WaitGroup
	for _, wt := range r.List() {
		wg.Add(1)
		go func(wt *Worktree) {
			defer wg.Done()
			_ = wt.Stop(ctx)
		}(wt)
	}
	wg.Wait()
	return nil
}

// ─── internal ────────────────────────────────────────────────

func (r *Registry) loadFile(path string) {
	name := nameFromPath(path)
	if !nameRegex.MatchString(name) {
		slog.Warn("invalid worktree name", "name", name, "path", path)
		return
	}
	spec, err := loadSpec(path)
	if err != nil {
		slog.Warn("failed to load spec", "path", path, "err", err)
		return
	}
	r.upsert(name, spec)
}

// loadLegacyFile loads a flat <name>.json spec. If a new-style subdirectory
// spec already registered this name, the legacy file is skipped.
func (r *Registry) loadLegacyFile(path string) {
	name := legacyNameFromPath(path)
	if !nameRegex.MatchString(name) {
		return
	}
	// New-style subdirectory takes precedence — skip legacy if it exists.
	newPath := filepath.Join(r.cfg.RegistryDir, name, "spec.json")
	if _, err := os.Stat(newPath); err == nil {
		return
	}
	spec, err := loadSpec(path)
	if err != nil {
		slog.Warn("failed to load legacy spec", "path", path, "err", err)
		return
	}
	r.upsert(name, spec)
}

func (r *Registry) upsert(name string, spec *Spec) {
	r.mu.Lock()
	wt, exists := r.byName[name]
	if !exists {
		newWt, err := NewWorktree(name, spec, r.cfg)
		if err != nil {
			r.mu.Unlock()
			slog.Warn("worktree rejected", "name", name, "err", err)
			return
		}
		r.byName[name] = newWt
		r.mu.Unlock()
		slog.Info("worktree registered", "name", name, "server", spec.Server, "web", spec.Web, "socket", newWt.primarySocketPath())
		return
	}
	r.mu.Unlock()
	wt.UpdateSpec(spec)
	slog.Info("worktree spec updated", "name", name)
}

func (r *Registry) remove(name string) {
	r.mu.Lock()
	wt, exists := r.byName[name]
	if !exists {
		r.mu.Unlock()
		return
	}
	delete(r.byName, name)
	r.mu.Unlock()
	slog.Info("worktree unregistered", "name", name)
	go func() {
		_ = wt.Stop(context.Background())
		wt.CloseLog()
	}()
}

func loadSpec(path string) (*Spec, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var spec Spec
	if err := json.Unmarshal(data, &spec); err != nil {
		return nil, fmt.Errorf("parse: %w", err)
	}
	if spec.Server == "" {
		return nil, errors.New("server is required")
	}
	if !filepath.IsAbs(spec.Server) {
		return nil, errors.New("server must be an absolute path")
	}
	// Web is optional — headless backends (e.g. central) have no UI bundle.
	if spec.Web != "" && !filepath.IsAbs(spec.Web) {
		return nil, errors.New("web must be an absolute path when provided")
	}
	return &spec, nil
}

// nameFromPath extracts the worktree name from a new-style path: <dir>/<name>/spec.json
func nameFromPath(p string) string {
	return filepath.Base(filepath.Dir(p))
}

// legacyNameFromPath extracts the worktree name from a legacy path: <dir>/<name>.json
func legacyNameFromPath(p string) string {
	return strings.TrimSuffix(filepath.Base(p), ".json")
}

const (
	reconcileDialTimeout = 300 * time.Millisecond
	reconcileKillGrace   = 2 * time.Second
	reconcileConcurrency = 8
)

// socketStem derives the worktree name from a <name>.sock or <name>.next.sock
// filename.
func socketStem(name string) string {
	if s, ok := strings.CutSuffix(name, ".next.sock"); ok {
		return s
	}
	return strings.TrimSuffix(name, ".sock")
}

// reconcileOrphanBackends asserts the gateway's ownership invariant at boot:
// since the gateway has spawned ZERO backends at this point, any process still
// bound to a worktree socket is an orphan from a prior gateway generation and
// must be reaped. It supersedes the old name-based stale-socket sweep —
// crucially, it does NOT skip registered worktrees (a registered worktree with
// a live orphan socket is exactly the leak this fixes).
//
// MUST run synchronously before the watcher/sweep/eager-central goroutines
// start (see main.go) — the "zero backends yet" invariant evaporates the instant
// the gateway begins spawning, so this is safe only at boot and is never run
// periodically.
//
// Per socket: a bare connect is the liveness gate (a wedged-but-bound backend
// still completes the connection — and we want to reap it). Not live → remove
// the socket + pid sidecar. Live + sidecar → kill the recorded process group,
// then remove. Live + no sidecar (legacy backend predating the sidecar) → log
// loudly and leave it; the per-spawn unlink and the backend's own ppid-poll
// escape hatch clean it up.
func reconcileOrphanBackends(dir string, reg *Registry) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		slog.Warn("sockets dir scan failed", "dir", dir, "err", err)
		return
	}

	sockets := make(map[string]bool)
	var wg sync.WaitGroup
	sem := make(chan struct{}, reconcileConcurrency)
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".sock") {
			continue
		}
		sockets[name] = true
		path := filepath.Join(dir, name)
		stem := socketStem(name)
		wg.Add(1)
		sem <- struct{}{}
		go func(path, stem string) {
			defer wg.Done()
			defer func() { <-sem }()
			reconcileOneSocket(path, stem, reg)
		}(path, stem)
	}
	wg.Wait()

	// Reap orphaned zero-cache sidecars from a prior gateway generation. Unlike
	// backends, the zero-cache binds a TCP port (no socket file to probe), so the
	// <name>.zero.pid record is the sole orphan signal: kill the recorded process
	// group (releasing its port + slot) and remove the sidecar. Boot-only — the
	// gateway owns zero sidecars at this point, so any recorded pid is an orphan.
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".zero.pid") {
			continue
		}
		p := filepath.Join(dir, name)
		sc, err := readZeroSidecar(p)
		if err != nil || sc == nil {
			slog.Warn("orphan zero-cache sidecar unreadable; removing", "path", p, "err", err)
		} else if processAlive(sc.PID) {
			slog.Warn("reaping orphan zero-cache from prior gateway generation",
				"path", p, "pid", sc.PID, "pgid", sc.PGID, "wallStart", sc.WallStart)
			reapPgid(sc.PGID, sc.PID, reconcileKillGrace, p)
		}
		if rmErr := os.Remove(p); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
			slog.Warn("remove orphan zero-cache sidecar failed", "path", p, "err", rmErr)
		} else {
			slog.Info("removed orphan zero-cache sidecar", "path", p)
		}
	}

	// GC orphan *.pid sidecars whose socket file is already gone (the live
	// branches above remove sidecars alongside their sockets, so those are
	// already handled).
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".pid") {
			continue
		}
		// .zero.pid sidecars are handled above (no associated socket file).
		if strings.HasSuffix(name, ".zero.pid") {
			continue
		}
		sockName := strings.TrimSuffix(name, ".pid")
		if sockets[sockName] {
			continue
		}
		if _, statErr := os.Stat(filepath.Join(dir, sockName)); errors.Is(statErr, os.ErrNotExist) {
			p := filepath.Join(dir, name)
			if rmErr := os.Remove(p); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
				slog.Warn("remove orphan sidecar failed", "path", p, "err", rmErr)
			} else {
				slog.Info("removed orphan pid sidecar", "path", p)
			}
		}
	}

	slog.Info("orphan reconcile complete", "dir", dir)
}

func reconcileOneSocket(path, stem string, reg *Registry) {
	registered := reg.HasName(stem)
	if !backendListening(path) {
		// Nothing bound — stale socket file. Remove socket + sidecar.
		_ = removeBackendArtifacts(path)
		slog.Info("removed stale socket", "path", path, "registered", registered)
		return
	}
	// A process is bound at boot: an orphan from a prior gateway generation.
	sc, err := readBackendSidecar(path)
	if err != nil || sc == nil {
		slog.Error("live orphan backend with no pid record; reap manually (lsof -U / kill)",
			"path", path, "registered", registered, "err", err)
		return
	}
	slog.Warn("reaping orphan backend from prior gateway generation",
		"path", path, "pid", sc.PID, "pgid", sc.PGID, "wallStart", sc.WallStart, "registered", registered)
	reapPgid(sc.PGID, sc.PID, reconcileKillGrace, path)
	_ = removeBackendArtifacts(path)
}

// backendListening reports whether a process is bound to the Unix socket. A bare
// connect suffices: the kernel completes it into the listen backlog even if the
// backend's event loop is wedged and never accept()s — which is precisely a case
// we want to treat as "live, reap it".
func backendListening(socketPath string) bool {
	c, err := net.DialTimeout("unix", socketPath, reconcileDialTimeout)
	if err != nil {
		return false
	}
	_ = c.Close()
	return true
}
