
import "dotenv/config";
import app from "./app.js";
import { prisma } from "./lib/prisma.js";
import { startOrderScheduler } from "./services/scheduler.service.js";

const port = Number(process.env.PORT || 4000);

const server = app.listen(port, () => {
  console.log(`[api] Still Good API berjalan di http://localhost:${port}`);

  if (process.env.ENABLE_ORDER_SCHEDULER !== "false") {
    startOrderScheduler();
  }
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
