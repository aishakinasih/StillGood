import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import apiRouter from "./routes/api.js";
import { prisma } from "./lib/prisma.js";
import { HttpError } from "./lib/errors.js";
import { startOrderScheduler } from "./services/scheduler.service.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../uploads");

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: (process.env.CORS_ORIGINS || "http://localhost:3000").split(",").map((value) => value.trim()),
  credentials: false,
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use("/uploads", express.static(uploadsDir, { maxAge: "1d", immutable: false }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Terlalu banyak percobaan. Coba kembali beberapa saat lagi." },
});
app.use("/api/register", authLimiter);
app.use("/api/login", authLimiter);
app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, service: "still-good-api", database: "connected" });
});
app.use("/api", apiRouter);

app.use((req, _res, next) => next(new HttpError(404, `Endpoint ${req.method} ${req.path} tidak ditemukan.`)));
app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message, details: error.details });
  }
  if (error?.code === "P2002") return res.status(409).json({ message: "Data yang dimasukkan sudah digunakan." });
  if (error?.code === "P2003") return res.status(409).json({ message: "Data masih digunakan oleh data lain." });
  if (error?.code === "P2025") return res.status(404).json({ message: "Data tidak ditemukan." });
  if (error?.name === "MulterError") return res.status(422).json({ message: error.code === "LIMIT_FILE_SIZE" ? "Ukuran foto maksimal 4 MB." : error.message });
  console.error(error);
  return res.status(500).json({ message: process.env.NODE_ENV === "production" ? "Terjadi kesalahan pada server." : error.message || "Internal server error." });
});

const server = app.listen(port, () => {
  console.log(`[api] Still Good API berjalan di http://localhost:${port}`);
  if (process.env.ENABLE_ORDER_SCHEDULER !== "false") startOrderScheduler();
});

async function shutdown(signal) {
  console.log(`[api] Menerima ${signal}; menutup koneksi...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
