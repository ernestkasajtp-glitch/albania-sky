import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { startPerformanceMetrics } from "./lib/performanceMetrics";

startPerformanceMetrics();
createRoot(document.getElementById("root")!).render(<App />);
