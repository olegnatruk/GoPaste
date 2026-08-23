import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../shared/styles.css";
import { OptionsShell } from "./OptionsShell";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Options root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <OptionsShell />
  </StrictMode>,
);
