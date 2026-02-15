import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupGlobalErrorHandlers } from "@/lib/logger";
import * as Sentry from '@sentry/react';

// --- Sentry error monitoring for renderer (FIX-13) ---
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: `hedge-edge@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
    enabled: import.meta.env.PROD,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.filter(
          b => !b.message?.includes('password') && !b.message?.includes('token')
        );
      }
      return event;
    },
    denyUrls: [
      /extensions\//i,
      /^chrome:\/\//i,
    ],
  });
}

// Initialize global error handlers for uncaught errors
setupGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(<App />);
