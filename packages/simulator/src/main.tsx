import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "@ellie/ui/tokens.css";
import "@ellie/ui/ui.css";
import "./simulator.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
