import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const clientId = import.meta.env.VITE_GSI_CLIENT_ID as string | undefined;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {clientId ? (
      <GoogleOAuthProvider clientId={clientId}>
        <HashRouter>
          <App />
        </HashRouter>
      </GoogleOAuthProvider>
    ) : (
      <div className="flex min-h-screen items-center justify-center bg-hero-gradient p-6">
        <div className="glass-card max-w-lg p-8 text-center">
          <h1 className="text-2xl font-semibold text-ink-900">Missing Client ID</h1>
          <p className="mt-2 text-sm text-ink-500">
            Set <span className="font-semibold">VITE_GSI_CLIENT_ID</span> in your environment.
          </p>
        </div>
      </div>
    )}
  </React.StrictMode>
);
