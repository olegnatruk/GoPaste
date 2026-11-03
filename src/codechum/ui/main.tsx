import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../../shared/styles.css";
import { CodeChumPage } from "./CodeChumPage";
import { chromeCodeChumServices } from "./services";
import "./codechum.css";

const root = document.getElementById("root");
if (!root) throw new Error("CodeChum root was not found.");

const tabIdValue = new URLSearchParams(location.search).get("tabId");
const tabId = tabIdValue && /^\d+$/.test(tabIdValue) ? Number(tabIdValue) : undefined;

createRoot(root).render(
  <StrictMode>
    <CodeChumPage services={chromeCodeChumServices} initialTabId={tabId} />
  </StrictMode>,
);
