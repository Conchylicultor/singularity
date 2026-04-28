package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fsnotify/fsnotify"
)

// CentralRoutes is the in-memory projection of the central-routes manifest
// written by `./singularity build`. The manifest declares a singleton backend
// (typically "central") and the path prefixes that should be forwarded to it
// from any host.
type CentralRoutes struct {
	Backend  string
	Prefixes []string
}

// Match returns the backend name if `path` is covered by any prefix in this
// manifest, or "" if the manifest is nil/empty or no prefix matches. Nil
// receivers are valid (return "").
func (c *CentralRoutes) Match(path string) string {
	if c == nil || c.Backend == "" || len(c.Prefixes) == 0 {
		return ""
	}
	for _, p := range c.Prefixes {
		if p == "" {
			continue
		}
		if strings.HasPrefix(path, p) {
			return c.Backend
		}
	}
	return ""
}

// CentralRoutesStore loads and watches the manifest file, swapping the
// in-memory pointer atomically on each reload.
type CentralRoutesStore struct {
	path   string
	routes atomic.Pointer[CentralRoutes]
}

func NewCentralRoutesStore(path string) *CentralRoutesStore {
	return &CentralRoutesStore{path: path}
}

// Get returns the current routes, or nil if the manifest is missing/invalid.
// Lock-free.
func (s *CentralRoutesStore) Get() *CentralRoutes {
	return s.routes.Load()
}

// Load reads the manifest from disk and updates the in-memory pointer.
// Missing file is not an error — it just clears the routes.
func (s *CentralRoutesStore) Load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			s.routes.Store(nil)
			return
		}
		slog.Warn("central routes read failed", "path", s.path, "err", err)
		return
	}
	var raw struct {
		Backend string   `json:"backend"`
		Routes  []string `json:"routes"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		slog.Warn("central routes parse failed", "path", s.path, "err", err)
		return
	}
	cr := &CentralRoutes{Backend: raw.Backend, Prefixes: raw.Routes}
	s.routes.Store(cr)
	slog.Info("central routes loaded",
		"backend", raw.Backend,
		"count", len(raw.Routes),
	)
}

// Watch blocks until ctx is done, calling Load() on file change. Watches the
// parent directory and filters by basename so that atomic rename writes
// (`tmp` then `rename`) are handled correctly.
func (s *CentralRoutesStore) Watch(ctx context.Context) error {
	parent := filepath.Dir(s.path)
	base := filepath.Base(s.path)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return err
	}
	s.Load() // initial load

	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer w.Close()
	if err := w.Add(parent); err != nil {
		return err
	}

	var (
		debounce   *time.Timer
		debounceMu sync.Mutex
	)

	for {
		select {
		case <-ctx.Done():
			return nil
		case ev, ok := <-w.Events:
			if !ok {
				return nil
			}
			if filepath.Base(ev.Name) != base {
				continue
			}
			if ev.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Remove|fsnotify.Rename) == 0 {
				continue
			}
			debounceMu.Lock()
			if debounce != nil {
				debounce.Stop()
			}
			debounce = time.AfterFunc(100*time.Millisecond, s.Load)
			debounceMu.Unlock()
		case err, ok := <-w.Errors:
			if !ok {
				return nil
			}
			slog.Warn("central routes watcher error", "err", err)
		}
	}
}
