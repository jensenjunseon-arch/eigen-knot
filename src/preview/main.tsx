import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/design/fonts"; // self-hosted @font-face (side-effect) — load before render
import "@/design/base.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
