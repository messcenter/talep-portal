// src/client/main.tsx
// React entry point — mounts <App/> into #root.
import { createRoot } from "react-dom/client";
import { App } from "./app";

const container = document.getElementById("root");
if (!container) throw new Error("No #root element found");
createRoot(container).render(<App />);
