import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css";
import { markBootInstant } from "@plugins/primitives/plugins/perfs/plugins/boot-trace/web";
import App from "./App";

markBootInstant("module-eval", "scripts", "main.tsx eval");

const host = window.location.hostname;
const sub = host.endsWith(".localhost") ? host.replace(/\.localhost$/, "") : null;
if (sub && sub !== "singularity") {
  document.documentElement.classList.add("experimental");
}

markBootInstant("create-root", "scripts", "createRoot");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
