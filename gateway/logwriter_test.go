package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestRotatingWriterRotatesAndCapsBackups(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.log")
	// Tiny cap so each 10-byte line rotates.
	w := newRotatingWriter(path, 10, 2)
	defer w.Close()

	for i := 0; i < 6; i++ {
		if _, err := fmt.Fprintf(w, "line-%02d\n", i); err != nil {
			t.Fatalf("write %d: %v", i, err)
		}
	}

	// Active file plus at most maxBackups (.1, .2). .3 must never exist.
	for _, name := range []string{"test.log", "test.log.1", "test.log.2"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("expected %s to exist: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "test.log.3")); !os.IsNotExist(err) {
		t.Errorf("test.log.3 should have been dropped, got err=%v", err)
	}
}

func TestRotatingWriterResumesSizeFromDisk(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.log")
	if err := os.WriteFile(path, []byte("0123456789"), 0o644); err != nil {
		t.Fatal(err)
	}
	w := newRotatingWriter(path, 11, 2)
	defer w.Close()

	// File is already at the cap; the next write must rotate, preserving the
	// pre-existing content in test.log.1.
	if _, err := fmt.Fprintf(w, "x\n"); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(path + ".1")
	if err != nil {
		t.Fatalf("expected rotated backup: %v", err)
	}
	if string(b) != "0123456789" {
		t.Errorf("backup content = %q, want original", string(b))
	}
}

func TestRotatingWriterConcurrentWritesAreAtomic(t *testing.T) {
	dir := t.TempDir()
	w := newRotatingWriter(filepath.Join(dir, "test.log"), maxLogBytes, maxLogBackups)
	defer w.Close()

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			_, _ = fmt.Fprintf(w, "goroutine-%d-writes-a-full-line\n", n)
		}(i)
	}
	wg.Wait()
	// No assertion beyond "did not panic / race"; run with -race to catch
	// interleaving. The mutex guarantees each line is written whole.
}
