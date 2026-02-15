import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Vite config for Electron desktop app renderer process
// The renderer is built as a web bundle loaded by Electron via file:// protocol
export default defineConfig(() => ({
  // Use relative paths for Electron file:// protocol
  base: "./",
  server: {
    host: "::",
    port: 3000,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Target Electron's Chromium version
    target: "chrome120",
    // Never expose source maps in production (FIX-10)
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // UI components library (Radix)
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-popover",
            "@radix-ui/react-tabs",
            "@radix-ui/react-accordion",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-switch",
            "@radix-ui/react-slider",
            "@radix-ui/react-toast",
            "@radix-ui/react-scroll-area",
          ],
          // Charts library
          "vendor-charts": ["recharts"],
          // Supabase client
          "vendor-supabase": ["@supabase/supabase-js"],
          // Form handling
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          // Date utilities
          "vendor-date": ["date-fns", "react-day-picker"],
          // Icons
          "vendor-icons": ["lucide-react"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));

