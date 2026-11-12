import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/Toast";
import { isFileMode } from "./lib/format";
import { applyTheme, getTheme } from "./lib/theme";
import "./index.css";

// Aplica o tema salvo antes de desenhar a tela
applyTheme(getTheme());

// Acompanha mudanças de tema em outras abas
window.addEventListener("storage", (e) => {
  if (e.key === "agendapro:tema") {
    applyTheme(getTheme());
    window.dispatchEvent(new Event("agendapro:tema"));
  }
});

// Arquivo local usa HashRouter.
// GitHub Pages usa o caminho-base definido pelo Vite.
const fileMode = isFileMode();
const Router = fileMode ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router basename={fileMode ? undefined : import.meta.env.BASE_URL}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </Router>
  </StrictMode>,
);
