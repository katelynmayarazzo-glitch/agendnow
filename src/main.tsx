import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/Toast";
import { isFileMode } from "./lib/format";
import { applyTheme, getTheme } from "./lib/theme";
import "./index.css";

// aplica o tema salvo antes de desenhar a tela (evita "piscar" branco)
applyTheme(getTheme());
// se o tema mudar em outra aba (ex.: painel aberto + página do cliente), acompanha
window.addEventListener("storage", (e) => {
  if (e.key === "agendapro:tema") {
    applyTheme(getTheme());
    window.dispatchEvent(new Event("agendapro:tema"));
  }
});

// Aberto como arquivo no computador → rotas com "#"; publicado num servidor → rotas normais.
const Router = isFileMode() ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </Router>
  </StrictMode>,
);
