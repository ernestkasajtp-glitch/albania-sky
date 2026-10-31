import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import { VitePWA } from "vite-plugin-pwa";
import { APP_VERSION } from "./src/lib/version";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

const basePath = process.env.BASE_PATH || (process.env.NODE_ENV === "production" ? "/flight-system/" : "/");

// APP_VERSION është burimi i vetëm për kontrollin e versionit në bundle dhe
// version.json. builtAt ruhet veçmas vetëm si informacion për build-in.
const BUILD_VERSION = APP_VERSION;

const versionFilePlugin = () => ({
  name: "fs-version-file",
  closeBundle() {
    const outDir = path.resolve(import.meta.dirname, "dist/public");
    try {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, "version.json"),
        JSON.stringify({ version: BUILD_VERSION, builtAt: new Date().toISOString() }) + "\n",
      );
    } catch (e) {
      console.warn("Failed to write version.json", e);
    }
  },
});

export default defineConfig({
  base: basePath,
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  plugins: [
    versionFilePlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      // "autoUpdate": service worker-i i ri aktivizohet vetë dhe faqja merr
      // menjëherë versionin e fundit. Me "prompt" (pa UI për prompt-in) disa
      // kompjuterë ngelnin PËRGJITHMONË me bundle të vjetër të cache-uar nga
      // SW i vjetër — "sistemi ngec, s'hapet mirë" vetëm në atë kompjuter.
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Kings Management — Flight System",
        short_name: "KM Flights",
        description: "Flight Management System",
        theme_color: "#FF3C00",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: basePath,
        scope: basePath,
        icons: [
          {
            src: "icons/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // CACHE FIX (16.08.2026): api-cache nuk kishte as kufi as skadim —
            // rritej pafund (qindra MB pas ditësh përdorimi) dhe e ngadalësonte
            // shfletuesin; shfletues i ri punonte mirë në fillim. Tani:
            // 1) përjashtohen kërkesat që përsëriten çdo minutë (lista, numëratorë,
            //    kanali live) — vetëm e frynin cache-in pa asnjë dobi;
            // 2) pjesa tjetër kufizohet: max 50 hyrje, skadim 24h, vetëm GET.
            urlPattern: ({ url, request }) => {
              if (!url.pathname.startsWith("/api/")) return false;
              if (request.method !== "GET") return false;
              const deny = [
                "/api/live/",            // SSE — s'duhet cache-uar kurrë
                "/api/admin-email/booking-latest", // informational inbox poll must not wait on SW cache
                "/api/branding",         // HTTP cache ruan imazhet me URL të versionuara
                "/api/bookings",
                "/api/flights",
                "/api/routes",           // Airport filters must reflect existing flights, never stale routes
                "/api/tasks",
                "/api/schedule-changes",
                "/api/cp-import-alerts",
                "/api/price-requests",
              ];
              return !deny.some(p => url.pathname.startsWith(p));
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
