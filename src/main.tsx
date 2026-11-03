import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./engine/boat.js";
import "./engine/sea.js";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
