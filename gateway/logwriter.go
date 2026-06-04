package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Log files are size-rotated to keep the long-lived gateway daemon from
// growing them without bound. Tuned so the worst case per channel is
// maxLogBytes * (maxLogBackups + 1) ≈ 300 MB.
const (
	maxLogBytes   int64 = 50 * 1024 * 1024
	maxLogBackups       = 5
)

// rotatingWriter is a size-bounded io.WriteCloser. When a write would push the
// backing file past maxBytes it rotates: the current file becomes path.1, the
// previous path.1 becomes path.2, … and path.maxBackups (the oldest) is
// dropped. Safe for concurrent use — each Write is atomic under the mutex, so
// callers never interleave partial lines. Self-contained on purpose: the
// gateway builds offline, so we avoid pulling in an external rotation library.
type rotatingWriter struct {
	mu         sync.Mutex
	path       string
	maxBytes   int64
	maxBackups int
	f          *os.File
	size       int64
}

func newRotatingWriter(path string, maxBytes int64, maxBackups int) *rotatingWriter {
	return &rotatingWriter{path: path, maxBytes: maxBytes, maxBackups: maxBackups}
}

func (w *rotatingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.f == nil {
		if err := w.openLocked(); err != nil {
			return 0, err
		}
	}
	if w.size > 0 && w.size+int64(len(p)) > w.maxBytes {
		if err := w.rotateLocked(); err != nil {
			return 0, err
		}
	}
	n, err := w.f.Write(p)
	w.size += int64(n)
	return n, err
}

// openLocked opens (creating + appending) the active file and syncs size from
// disk so an existing file rotates at the right point after a restart.
func (w *rotatingWriter) openLocked() error {
	if err := os.MkdirAll(filepath.Dir(w.path), 0o755); err != nil {
		return err
	}
	f, err := os.OpenFile(w.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return err
	}
	w.f = f
	w.size = info.Size()
	return nil
}

// rotateLocked closes the active file, shifts every backup up by one (dropping
// the oldest), renames the active file to path.1, and reopens a fresh active
// file. Caller holds w.mu.
func (w *rotatingWriter) rotateLocked() error {
	if w.f != nil {
		_ = w.f.Close()
		w.f = nil
	}
	if w.maxBackups <= 0 {
		_ = os.Remove(w.path)
		return w.openLocked()
	}
	_ = os.Remove(fmt.Sprintf("%s.%d", w.path, w.maxBackups))
	for i := w.maxBackups - 1; i >= 1; i-- {
		_ = os.Rename(fmt.Sprintf("%s.%d", w.path, i), fmt.Sprintf("%s.%d", w.path, i+1))
	}
	_ = os.Rename(w.path, w.path+".1")
	return w.openLocked()
}

func (w *rotatingWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.f == nil {
		return nil
	}
	err := w.f.Close()
	w.f = nil
	return err
}
