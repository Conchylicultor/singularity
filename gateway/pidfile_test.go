package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestWritePidFileCreatesParentAndRecordsOwnPid(t *testing.T) {
	path := filepath.Join(t.TempDir(), "locks", "gateway", "gateway.pid")
	if err := writePidFile(path); err != nil {
		t.Fatalf("writePidFile: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if want := fmt.Sprintf("%d\n", os.Getpid()); string(got) != want {
		t.Fatalf("pidfile = %q, want %q", got, want)
	}
}
