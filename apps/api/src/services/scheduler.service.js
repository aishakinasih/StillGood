import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { refundMidtrans } from "./payment.service.js";
import { notifyOrderParties } from "./notification.service.js";

let running = false;

async function restoreStock(orderId) {
  const lines = await prisma.orderItem.findMany({ where: { order_id: orderId } });
  for (const line of lines) {
    if (line.product_id) {
      await prisma.product.updateMany({
        where: { id: line.product_id },
        data: { stock: { increment: line.quantity } },
      });
    }
  }
}

async function processOne(order, reason, finalStatus) {
  const claimed = await prisma.order.updateMany({
    where: {
      id: order.id,
      status: order.status,
      payment_status: order.payment_status,
    },
    data: { status: "Pembatalan Diproses" },
  });
  if (claimed.count !== 1) return;

  try {
    let refunded = false;
    if (order.payment_status === "PAID" && order.payment_provider === "MIDTRANS") {
      await refundMidtrans(order, reason);
      refunded = true;
    } else if (order.payment_status === "PAID" && order.payment_provider === "MOCK") {
      refunded = true; // A status record only; no real funds move in mock mode.
    }

    await prisma.$transaction(async (tx) => {
      const lines = await tx.orderItem.findMany({ where: { order_id: order.id } });
      for (const line of lines) {
        if (line.product_id) await tx.product.updateMany({ where: { id: line.product_id }, data: { stock: { increment: line.quantity } } });
      }
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: finalStatus,
          payment_status: refunded ? "REFUNDED" : "CANCELLED",
          refunded_at: refunded ? new Date() : null,
        },
      });
      await tx.payment.updateMany({
        where: { order_id: order.id },
        data: { status: refunded ? "REFUNDED" : "CANCELLED", refunded_at: refunded ? new Date() : null },
      });
    });
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    await notifyOrderParties(fresh, "ORDER_EXPIRED", `Pesanan #${fresh.id} dibatalkan otomatis. ${reason}`);
  } catch (error) {
    // Leave the order eligible for retry; do not restore stock until a required refund succeeds.
    await prisma.order.updateMany({
      where: { id: order.id, status: "Pembatalan Diproses" },
      data: { status: order.status },
    });
    console.error(`[scheduler] Gagal memproses pembatalan order ${order.id}:`, error.message);
  }
}

export async function runOrderSchedulerOnce() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const sellerOverdue = await prisma.order.findMany({
      where: { status: "Menunggu Konfirmasi", OR: [{payment_status: "PAID"}, {payment_provider: "CASH"}], seller_deadline: { lt: now } },
      take: 50,
      orderBy: { seller_deadline: "asc" },
    });
    for (const order of sellerOverdue) {
      await processOne(order, "Penjual tidak merespons dalam lima menit.", "Dibatalkan Penjual");
    }

    const paymentExpiredBefore = new Date(now.getTime() - 30 * 60_000);
    const unpaidExpired = await prisma.order.findMany({
      where: { status: "Menunggu Pembayaran", payment_status: "PENDING", created_at: { lt: paymentExpiredBefore } },
      take: 50,
      orderBy: { created_at: "asc" },
    });
    for (const order of unpaidExpired) {
      await processOne(order, "Batas pembayaran tiga puluh menit telah berakhir.", "Dibatalkan Pembayaran");
    }
  } catch (error) {
    console.error("[scheduler] Order scheduler error:", error.message);
  } finally {
    running = false;
  }
}

export function startOrderScheduler() {
  // Check every second so the five-minute seller deadline is enforced with low delay. Database conditions keep the job idempotent across ticks.
  cron.schedule("* * * * * *", runOrderSchedulerOnce, { timezone: process.env.APP_TIME_ZONE || "Asia/Jakarta" });
  runOrderSchedulerOnce();
  console.log("[scheduler] Order expiry worker aktif (interval 1 detik).");
}
