import express, { type Express } from "express";
import compression from "compression";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { DrizzleSessionStore } from "./lib/sessionStore";
import { activityLogger } from "./lib/activityLogger";
import { enforceFmsIp } from "./lib/fmsIpAccess";
import { databaseAuditContext } from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Trust reverse proxy (Replit, Nginx, etc.) so cookies work on HTTPS
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Gzip compression — big JSON lists (bookings, flights) shrink ~85-90%,
// which is the main win for page-load speed over the internet.
// PËRJASHTIM: kanali live (SSE) NUK duhet kompresuar — gzip i mban event-et
// në buffer dhe njoftimet nuk arrijnë në moment te shfletuesi.
app.use(compression({
  filter: (req, res) => {
    if (req.path === "/api/live/events") return false;
    return compression.filter(req, res);
  },
}));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const FMS_SESSION_MS = 12 * 60 * 60 * 1000;  // 12 orë inaktiviteti
const BE_SESSION_MS  = 12 * 60 * 60 * 1000;  // 12 orë inaktiviteti (agjencitë rrinë gjithë ditën me faqen hapur)

const fmsSession = session({
  store: new DrizzleSessionStore(),
  name: "fms_sid",
  secret: process.env.SESSION_SECRET || "fms-booking-engine-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: FMS_SESSION_MS,
  },
});

const beSession = session({
  store: new DrizzleSessionStore(),
  name: "be_sid",
  secret: process.env.SESSION_SECRET || "fms-booking-engine-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: BE_SESSION_MS,
  },
});

const beRoutes = ["/auth/", "/auth", "/public/", "/public"];

app.use("/api", (req, res, next) => {
  // /branding: GET is public (BE site reads it), PUT/POST/DELETE are admin (FMS)
  const isBrandingRead = req.method === "GET" &&
    (req.path === "/branding" || req.path.startsWith("/branding/image/"));
  const isBE = isBrandingRead || beRoutes.some(r => req.path === r || req.path.startsWith(r + "/") || req.path.startsWith(r));
  if (isBE) {
    beSession(req, res, next);
  } else {
    fmsSession(req, res, next);
  }
});

app.use("/api", enforceFmsIp);

// Full agent activity log: records every authenticated agent API request
// (fire-and-forget) once the session has been resolved above. No-op for
// admin/FMS sessions (no agentId).
app.use("/api", activityLogger);
app.use("/api", (req, _res, next) => {
  databaseAuditContext.run(() => ({
    userId: req.session?.userId ?? null,
    userName: (req.session as any)?.userName ?? null,
    userRole: req.session?.role ?? null,
    // No query string, headers, body, IP, token or payment return URL is retained.
    source: `${req.method} ${req.baseUrl}${req.route?.path ?? "/(middleware)"}`,
  }), next);
});

// Serve uploaded files publicly. Mounted under both /uploads and /api/uploads —
// the latter is reachable through the shared /api proxy route (nginx / Replit).
// Registered before the /api router so static files take priority.
const uploadsStatic = express.static(path.join(__dirname, "..", "uploads"), {
  setHeaders: (res, filePath) => {
    // Prevent MIME sniffing for all uploaded files.
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (filePath.includes(`${path.sep}destinations${path.sep}`)) {
      // Destination uploads always receive a new filename when changed. Keep the
      // small generated cards for a year and let original-image fallbacks cache
      // for one day without making manually restored legacy files too sticky.
      if (/\.card\.v1\.webp$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      }
    }
    // Force payment documents to download instead of rendering inline, so any
    // crafted content cannot execute as script in the app origin. (<img> loads
    // ignore Content-Disposition, so destination photos still render inline.)
    if (filePath.includes(`${path.sep}payments${path.sep}`)) {
      res.setHeader("Content-Disposition", "attachment");
    }
  },
});
// PDF-të e njoftimeve të email-it (/uploads/alerts/…) NUK shërbehen publikisht —
// ato kërkojnë auth dhe shërbehen nga rruga /api/uploads/alerts/:file (bookings router).
const uploadsGuarded: express.RequestHandler = (req, res, next) => {
  if (req.path.startsWith("/alerts/")) { next(); return; }
  uploadsStatic(req, res, next);
};
app.use("/uploads", uploadsGuarded);
app.use("/api/uploads", uploadsGuarded);

app.use("/api", router);

// Optional single-service hosting (e.g. Render): when SERVE_FRONTENDS=1 the API
// also serves the built panel at /flight-system/ and the booking portal at /,
// so everything shares one origin like the nginx setup in deploy/nginx.conf.
if (process.env.SERVE_FRONTENDS === "1") {
  const artifactsDir = path.resolve(__dirname, "..", "..");
  const fmsDir = path.join(artifactsDir, "flight-system", "dist", "public");
  const bookingDir = path.join(artifactsDir, "booking-engine", "dist", "public");
  app.use("/flight-system", express.static(fmsDir, { index: false }));
  app.get(/^\/flight-system(\/.*)?$/, (_req, res) => {
    res.sendFile(path.join(fmsDir, "index.html"));
  });
  app.use(express.static(bookingDir, { index: false }));
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
    res.sendFile(path.join(bookingDir, "index.html"));
  });
}

// Global error handler — MUST be last. Without it, an unhandled throw in any
// route (Express 5 forwards async rejections here) falls through to Express's
// default handler, which returns an HTML error page. Frontend `r.json()` then
// fails with "Unexpected token '<', "<!DOCTYPE "... is not valid JSON". Always
// respond with JSON so clients can parse and surface a readable message.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log?.error({ err }, "Unhandled route error");
  if (res.headersSent) return;
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: err?.message || "Gabim i brendshëm i serverit" });
});

export default app;
