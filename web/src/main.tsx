import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import App from "./App";

const host = window.location.hostname;
const sub = host.endsWith(".localhost") ? host.replace(/\.localhost$/, "") : null;
if (sub && sub !== "singularity") {
  document.documentElement.classList.add("experimental");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
