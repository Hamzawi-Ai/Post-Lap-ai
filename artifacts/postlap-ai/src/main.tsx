import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Allow the app to call a separately-hosted API in production.
// When unset, requests go to the same origin (default /api/*).
// e.g. VITE_API_BASE_URL=https://api.postlapai.com
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

createRoot(document.getElementById("root")!).render(<App />);
