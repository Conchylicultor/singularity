package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// newTestProxy builds a Proxy with an empty registry and no central routes — so
// any resolved namespace falls through to a `reg.Resolve(name) == nil` "unknown
// worktree: <name>" 404 (RegistryDir is unset, so Resolve never touches disk).
// That message reveals WHICH namespace the router resolved, which is exactly what
// these routing tests assert on.
func newTestProxy(t *testing.T, defaultNamespace string) *Proxy {
	t.Helper()
	cfg := &Config{SocketsDir: t.TempDir()}
	reg := NewRegistry(cfg)
	routes := NewCentralRoutesStore(filepath.Join(t.TempDir(), "central-routes.json")) // unloaded ⇒ Match==""
	return NewProxy(reg, routes, &Supervisor{}, defaultNamespace)
}

func serve(p *Proxy, host, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "http://"+host+path, nil)
	req.Host = host
	rec := httptest.NewRecorder()
	p.ServeHTTP(rec, req)
	return rec
}

// Without a default namespace, a subdomain-less request still gets the generic
// gateway 404 — today's behavior, unchanged for dev/multi-app.
func TestNoDefaultNamespaceBareLocalhost404(t *testing.T) {
	rec := serve(newTestProxy(t, ""), "localhost:9000", "/")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Use <name>.localhost") {
		t.Fatalf("expected generic gateway 404, got %q", rec.Body.String())
	}
}

// With a default namespace, a subdomain-less request resolves to it and proceeds
// to registry lookup (here: not found ⇒ "unknown worktree: sonata"). The generic
// gateway 404 is NOT returned — proving the fallback engaged.
func TestDefaultNamespaceRoutesBareLocalhost(t *testing.T) {
	rec := serve(newTestProxy(t, "sonata"), "localhost:9000", "/")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "unknown worktree: sonata") {
		t.Fatalf("expected fallback to namespace 'sonata', got %q", body)
	}
	if strings.Contains(body, "Use <name>.localhost") {
		t.Fatalf("default namespace should bypass the generic gateway 404, got %q", body)
	}
}

// An explicit subdomain wins over the default namespace (lowest precedence).
func TestSubdomainBeatsDefaultNamespace(t *testing.T) {
	rec := serve(newTestProxy(t, "sonata"), "other.localhost:9000", "/")
	if !strings.Contains(rec.Body.String(), "unknown worktree: other") {
		t.Fatalf("subdomain should win over default, got %q", rec.Body.String())
	}
}

// /gateway/* stays reserved on the subdomain-less host even with a default set.
func TestGatewayAPIReservedUnderDefaultNamespace(t *testing.T) {
	rec := serve(newTestProxy(t, "sonata"), "localhost:9000", "/gateway/worktrees")
	// handleGatewayAPI answers (200 with a JSON list) — it must NOT fall through
	// to the default-namespace backend path.
	if rec.Code != http.StatusOK {
		t.Fatalf("/gateway/worktrees status = %d, want 200 (reserved path)", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "unknown worktree") {
		t.Fatalf("/gateway/* must not route to the default namespace, got %q", rec.Body.String())
	}
}

// newStaticProxy registers a worktree with a real web dist dir (index.html +
// one artifact file) and returns a proxy serving it — exercising handleStatic.
func newStaticProxy(t *testing.T) (*Proxy, string) {
	t.Helper()
	regDir := t.TempDir()
	sockDir, err := os.MkdirTemp("/tmp", "gwsta")
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
	reg := NewRegistry(cfg)

	sub := filepath.Join(regDir, "alpha")
	server := filepath.Join(sub, "server")
	if err := os.MkdirAll(server, 0o755); err != nil {
		t.Fatal(err)
	}
	web := t.TempDir()
	if err := os.WriteFile(filepath.Join(web, "index.html"), []byte("<html>spa-shell</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	artifactDir := filepath.Join(web, "artifacts", "tasks.web.abc123")
	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(artifactDir, "index.js"), []byte("export {};"), 0o644); err != nil {
		t.Fatal(err)
	}
	spec := `{"server":"` + server + `","web":"` + web + `"}`
	if err := os.WriteFile(filepath.Join(sub, "spec.json"), []byte(spec), 0o644); err != nil {
		t.Fatal(err)
	}
	routes := NewCentralRoutesStore(filepath.Join(t.TempDir(), "central-routes.json"))
	return NewProxy(reg, routes, &Supervisor{}, ""), web
}

// An existing /artifacts/* file is served as-is.
func TestArtifactsHitServesFile(t *testing.T) {
	p, _ := newStaticProxy(t)
	rec := serve(p, "alpha.localhost:9000", "/artifacts/tasks.web.abc123/index.js")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "export {}") {
		t.Fatalf("expected artifact body, got %q", rec.Body.String())
	}
}

// A missing /artifacts/* file is an honest 404, never the SPA fallback: the
// import-map loader would otherwise receive index.html for a module URL and
// die with a cryptic parse error.
func TestArtifactsMissReturns404NotSPAFallback(t *testing.T) {
	p, _ := newStaticProxy(t)
	rec := serve(p, "alpha.localhost:9000", "/artifacts/tasks.web.abc123/missing.js")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "spa-shell") {
		t.Fatalf("artifact miss must not serve index.html, got %q", rec.Body.String())
	}
}

// Non-artifact unknown paths keep today's SPA fallback.
func TestNonArtifactMissKeepsSPAFallback(t *testing.T) {
	p, _ := newStaticProxy(t)
	rec := serve(p, "alpha.localhost:9000", "/tasks/t/some-route")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (SPA fallback)", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "spa-shell") {
		t.Fatalf("expected index.html fallback, got %q", rec.Body.String())
	}
}
