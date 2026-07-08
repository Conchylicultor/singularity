// Type correction (not a cast): @types/bun@1.3.x declares the top-level HTTP
// `idleTimeout` only on `HostnamePortServeOptions`, so the `XOR` in `Serve.Options`
// forces it to `undefined` on the `unix` branch — even though Bun applies the
// top-level HTTP idle timeout to unix-socket servers at runtime exactly the same.
// Lift it onto `BaseServeOptions` (shared by both the port and unix branches) so
// `Bun.serve({ unix, idleTimeout })` type-checks. This corrects a too-narrow
// third-party type at the source rather than casting around it at the call site.
import "bun";

declare module "bun" {
  namespace Serve {
    interface BaseServeOptions<WebSocketData> {
      idleTimeout?: number;
    }
  }
}
