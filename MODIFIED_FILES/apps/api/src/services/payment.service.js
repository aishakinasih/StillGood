import crypto from "node:crypto";
import { HttpError } from "../lib/errors.js";

const midtransBase = () => process.env.MIDTRANS_IS_PRODUCTION === "true"
  ? "https://app.midtrans.com"
  : "https://app.sandbox.midtrans.com";
const coreBase = () => process.env.MIDTRANS_IS_PRODUCTION === "true"
  ? "https://api.midtrans.com"
  : "https://api.sandbox.midtrans.com";

function serverKey() {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new HttpError(503, "MIDTRANS_SERVER_KEY belum diatur pada environment server.");
  return key;
}

function basicAuth() {
  return `Basic ${Buffer.from(`${serverKey()}:`).toString("base64")}`;
}

function enabledPayment(method) {
  if (method !== "QRIS") {
    throw new HttpError(422, "Metode pembayaran yang tersedia hanya QRIS.");
  }
  // Midtrans Snap channel identifier for QRIS.
  return ["other_qris"];
}

export function isMockPayment() {
  return (process.env.PAYMENT_MODE || "mock").toLowerCase() !== "midtrans";
}

export async function createMidtransSnap(order) {
  const webUrl = process.env.WEB_PUBLIC_URL || "http://localhost:3000";
  const payload = {
    transaction_details: {
      order_id: order.provider_order_id,
      gross_amount: order.total,
    },
    customer_details: {
      first_name: order.buyer_name,
      phone: order.buyer_phone,
    },
    enabled_payments: enabledPayment(order.payment_method),
    callbacks: {
      finish: `${webUrl}/payment/finish?order_id=${order.id}`,
      error: `${webUrl}/payment/finish?order_id=${order.id}&result=error`,
      pending: `${webUrl}/payment/finish?order_id=${order.id}&result=pending`,
    },
    item_details: [],
  };

  const response = await fetch(`${midtransBase()}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: basicAuth(),
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token || !body.redirect_url) {
    throw new HttpError(502, body.error_messages?.join(" ") || "Midtrans gagal membuat halaman pembayaran.", body);
  }
  return { token: body.token, redirectUrl: body.redirect_url };
}

export function verifyMidtransNotification(body) {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key || !body?.signature_key) return false;
  const expected = crypto.createHash("sha512")
    .update(`${body.order_id}${body.status_code}${body.gross_amount}${key}`)
    .digest("hex");
  const supplied = String(body.signature_key).toLowerCase();
  if (expected.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function refundMidtrans(order, reason) {
  if (!order.provider_order_id) throw new HttpError(409, "Nomor transaksi Midtrans tidak tersedia untuk refund.");
  const response = await fetch(`${coreBase()}/v2/${encodeURIComponent(order.provider_order_id)}/refund`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: basicAuth(),
    },
    body: JSON.stringify({
      refund_key: `STILLGOOD-REFUND-${order.id}`,
      amount: order.total,
      reason: String(reason || "Pesanan dibatalkan oleh sistem Still Good").slice(0, 255),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, body.status_message || body.message || "Midtrans belum menerima permintaan refund.", body);
  return body;
}
