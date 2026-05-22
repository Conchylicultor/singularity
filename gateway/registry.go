package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
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
// Used by sweepStaleSockets to identify orphan socket files.
func (r *Registry) HasName(name string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.byName[name]
	return ok
}

// Get returns the worktree with the given name, or nil if absent.
func (r *Registry) Get(name string) *Worktree {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.byName[name]
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

// Watch blocks until ctx is done, calling Upsert/Remove in response to
// fsnotify events. Watches for both new-style subdirectory spec.json and
// legacy flat <name>.json files. Writes are debounced 100ms to handle
// editors that perform write-rename-close.
func (r *Registry) Watch(ctx context.Context) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer w.Close()
	if err := w.Add(r.cfg.RegistryDir); err != nil {
		return err
	}

	// Watch each existing subdirectory for spec.json changes.
	entries, _ := os.ReadDir(r.cfg.RegistryDir)
	for _, e := range entries {
		if e.IsDir() {
			_ = w.Add(filepath.Join(r.cfg.RegistryDir, e.Name()))
		}
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

			// New subdirectory created — start watching it and load its spec if present.
			if ev.Op&fsnotify.Create != 0 {
				if info, err := os.Stat(ev.Name); err == nil && info.IsDir() {
					_ = w.Add(ev.Name)
					specPath := filepath.Join(ev.Name, "spec.json")
					if _, serr := os.Stat(specPath); serr == nil {
						r.loadFile(specPath)
					}
					continue
				}
			}

			base := filepath.Base(ev.Name)
			if !strings.HasSuffix(base, ".json") {
				continue
			}

			if base == "spec.json" {
				// New format: <name>/spec.json inside a subdirectory.
				if ev.Op&(fsnotify.Create|fsnotify.Write) != 0 {
					path := ev.Name
					debounceMu.Lock()
					if t, exists := debounce[path]; exists {
						t.Stop()
					}
					debounce[path] = time.AfterFunc(100*time.Millisecond, func() {
						r.loadFile(path)
					})
					debounceMu.Unlock()
				} else if ev.Op&(fsnotify.Remove|fsnotify.Rename) != 0 {
					r.remove(nameFromPath(ev.Name))
				}
			} else if filepath.Dir(ev.Name) == r.cfg.RegistryDir {
				// Legacy format: flat <name>.json in the top-level directory.
				if ev.Op&(fsnotify.Create|fsnotify.Write) != 0 {
					path := ev.Name
					debounceMu.Lock()
					if t, exists := debounce[path]; exists {
						t.Stop()
					}
					debounce[path] = time.AfterFunc(100*time.Millisecond, func() {
						r.loadLegacyFile(path)
					})
					debounceMu.Unlock()
				} else if ev.Op&(fsnotify.Remove|fsnotify.Rename) != 0 {
					r.remove(legacyNameFromPath(ev.Name))
				}
			}
		case werr, ok := <-w.Errors:
			if !ok {
				return nil
			}
			slog.Warn("watcher error", "err", werr)
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
	go func() { _ = wt.Stop(context.Background()) }()
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

// sweepStaleSockets removes any *.sock file in dir whose stem is not a
// registered worktree. Cosmetic — per-spawn unlink-before-bind already
// covers the normal case. This catches orphans left after a worktree's
// JSON manifest was removed while its socket file lingered.
func sweepStaleSockets(dir string, reg *Registry) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		slog.Warn("sockets dir scan failed", "dir", dir, "err", err)
		return
	}
	removed := 0
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".sock") {
			continue
		}
		// Derive worktree name from either <name>.sock or <name>.next.sock.
		var stem string
		if s, ok := strings.CutSuffix(name, ".next.sock"); ok {
			stem = s
		} else {
			stem = strings.TrimSuffix(name, ".sock")
		}
		if reg.HasName(stem) {
			continue
		}
		path := filepath.Join(dir, name)
		if err := os.Remove(path); err != nil {
			slog.Warn("orphan socket remove failed", "path", path, "err", err)
			continue
		}
		removed++
		slog.Info("orphan socket removed", "path", path)
	}
	slog.Info("socket sweep complete", "removed", removed, "dir", dir)
}
