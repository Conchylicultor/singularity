/* Prototype harness — runs inside the iframe served at /api/prototypes/<name>.
 *
 * Deterministic mount sequence (does NOT rely on Babel auto-transforming
 * <script type="text/babel"> — dynamically injected src scripts are unreliable):
 *   1. derive the prototype name from the document path
 *   2. fetch meta.json; apply meta.theme + meta.viewport
 *   3. inject each meta.styles <link> in order
 *   4. fetch + Babel.transform + run each meta.scripts file in order (deps first)
 *   5. mount window.App into #root
 * Fails loudly: any error is rendered into #proto-error instead of a blank page.
 */
(function () {
  function fail(stage, err) {
    const box = document.getElementById("proto-error");
    const msg = err && err.stack ? err.stack : String(err);
    if (box) {
      box.style.display = "block";
      box.innerHTML = "";
      const h = document.createElement("h2");
      h.textContent = "Prototype failed — " + stage;
      const pre = document.createElement("div");
      pre.textContent = msg;
      box.appendChild(h);
      box.appendChild(pre);
    }
    // Also surface on the console for log capture.
    console.error("[prototype] " + stage, err);
  }

  async function boot() {
    const name = location.pathname.split("/").filter(Boolean).pop();
    if (!name || name === "prototypes") {
      throw new Error("could not derive prototype name from path: " + location.pathname);
    }
    const base = "/api/prototypes/" + encodeURIComponent(name);

    // 2. meta.json
    let meta;
    try {
      const res = await fetch(base + "?path=meta.json");
      if (!res.ok) throw new Error("meta.json HTTP " + res.status);
      meta = await res.json();
    } catch (err) {
      fail("loading meta.json", err);
      return;
    }

    // Apply theme + viewport.
    if (meta.theme) {
      document.documentElement.classList.add(meta.theme);
      document.body.classList.add(meta.theme);
    }
    if (meta.viewport && meta.viewport.w && meta.viewport.h) {
      const root = document.getElementById("root");
      // Size the stage to the prototype's intrinsic viewport. The host app owns
      // any scale-to-fit; here we just lay the canvas out at its true size.
      root.style.width = meta.viewport.w + "px";
      root.style.height = meta.viewport.h + "px";
    }

    // 3. styles — inject <link> in order.
    for (const file of meta.styles || []) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = base + "?path=" + encodeURIComponent(file);
      document.head.appendChild(link);
    }

    // 4. scripts — fetch, transform, run in order (deps before app.jsx).
    for (const file of meta.scripts || []) {
      let src;
      try {
        const res = await fetch(base + "?path=" + encodeURIComponent(file));
        if (!res.ok) throw new Error(file + " HTTP " + res.status);
        src = await res.text();
      } catch (err) {
        fail("fetching " + file, err);
        return;
      }
      let code;
      try {
        // Classic runtime → React.createElement against the global React UMD
        // build. The default (automatic) runtime emits an ESM
        // `import { jsx } from "react/jsx-runtime"`, which cannot run inside
        // `new Function(...)` and has nothing to resolve against here.
        code = Babel.transform(src, {
          presets: [["react", { runtime: "classic" }]],
          filename: file,
        }).code;
      } catch (err) {
        fail("transforming " + file, err);
        return;
      }
      try {
        // Run as a plain script so it defines its globals (window.App, window.I, ...).
        new Function(code)();
      } catch (err) {
        fail("running " + file, err);
        return;
      }
    }

    // 5. mount.
    if (typeof window.App !== "function") {
      fail("mounting", new Error("window.App is not defined after running scripts " + JSON.stringify(meta.scripts || [])));
      return;
    }
    try {
      ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(window.App));
    } catch (err) {
      fail("rendering window.App", err);
      return;
    }

    // Swap any lucide placeholders for SVGs once the tree is painted.
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      // Two passes: once now, once after the first paint, since React mounts async.
      const draw = () => { try { window.lucide.createIcons(); } catch (e) { console.error("[prototype] lucide", e); } };
      requestAnimationFrame(draw);
      requestAnimationFrame(() => requestAnimationFrame(draw));
    }
  }

  boot().catch((err) => fail("boot", err));
})();
