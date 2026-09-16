package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestBackendLaunchArgvTransport(t *testing.T) {
	args, env, err := backendLaunch(&Spec{SocketTransport: "argv"}, "att-1", "/s/att-1.sock")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"--namespace", "att-1", "--socket", "/s/att-1.sock"}; !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %v, want %v", args, want)
	}
	// The point of the argv transport: nothing about the socket in the
	// environment, where every descendant of the backend would inherit it.
	if len(env) != 0 {
		t.Fatalf("env = %v, want none", env)
	}
}

func TestBackendLaunchLegacyTransport(t *testing.T) {
	args, env, err := backendLaunch(&Spec{}, "att-1", "/s/att-1.sock")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"--namespace", "att-1"}; !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %v, want %v", args, want)
	}
	if want := []string{"SOCKET_PATH=/s/att-1.sock"}; !reflect.DeepEqual(env, want) {
		t.Fatalf("env = %v, want %v", env, want)
	}
}

// A backend is told its socket exactly one way: an old backend handed
// `--socket` would ignore it, and a new one handed both would still leak the
// environment copy to its children.
func TestBackendLaunchNeverBothTransports(t *testing.T) {
	for _, transport := range []string{"", "argv"} {
		args, env, err := backendLaunch(&Spec{SocketTransport: transport}, "n", "/s/n.sock")
		if err != nil {
			t.Fatal(err)
		}
		inArgs := strings.Contains(strings.Join(args, " "), "--socket")
		inEnv := strings.Contains(strings.Join(env, " "), "SOCKET_PATH=")
		if inArgs == inEnv {
			t.Fatalf("transport %q: --socket in args = %v, SOCKET_PATH in env = %v; want exactly one", transport, inArgs, inEnv)
		}
	}
}

func TestBackendLaunchUnknownTransport(t *testing.T) {
	if _, _, err := backendLaunch(&Spec{SocketTransport: "env"}, "n", "/s/n.sock"); err == nil {
		t.Fatal("want an error for an unknown socketTransport")
	}
}

func TestLoadSpecSocketTransport(t *testing.T) {
	dir := t.TempDir()
	write := func(body string) string {
		path := filepath.Join(dir, "spec.json")
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
		return path
	}

	spec, err := loadSpec(write(`{"server": "/abs/server", "socketTransport": "argv"}`))
	if err != nil {
		t.Fatal(err)
	}
	if spec.SocketTransport != "argv" {
		t.Fatalf("SocketTransport = %q, want argv", spec.SocketTransport)
	}

	spec, err = loadSpec(write(`{"server": "/abs/server"}`))
	if err != nil {
		t.Fatal(err)
	}
	if spec.SocketTransport != "" {
		t.Fatalf("SocketTransport = %q, want absent", spec.SocketTransport)
	}

	if _, err := loadSpec(write(`{"server": "/abs/server", "socketTransport": "env"}`)); err == nil {
		t.Fatal("want loadSpec to reject an unknown socketTransport")
	}
}
