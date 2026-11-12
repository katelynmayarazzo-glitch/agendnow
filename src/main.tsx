import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/Toast";
import { isFileMode } from "./lib/format";
import { applyTheme, getTheme } from "./lib/theme";
import "./index.css";

applyTheme(getTheme());

window.addEventListener("storage", (e) => {
  if (e.key === "agendapro:tema") {
    applyTheme(getTheme());
    window.dispatchEvent(new Event("agendapro:tema"));
  }
});

const fileMode = isFileMode();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {fileMode ? (
      <HashRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </HashRouter>
    ) : (
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
);
