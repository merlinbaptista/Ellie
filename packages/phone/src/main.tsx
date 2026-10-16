import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "@ellie/ui/tokens.css";
import "@ellie/ui/ui.css";
import "./phone.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
