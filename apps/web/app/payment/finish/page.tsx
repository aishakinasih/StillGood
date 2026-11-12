"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PaymentState = {
  order_id: number;
  status: string;
  payment_status: string;
  pickup_pin: string;
  cancel_until: string | null;
};

export default function PaymentFinishPage() {
  const [state, setState] = useState<PaymentState | null>(null);
  const [message, setMessage] = useState("Memeriksa status pembayaran...");
  const [error, setError] = useState("");

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("order_id");
    const token = sessionStorage.getItem("stillgood-token");
    if (!orderId || !token) {
      setError("Pesanan atau sesi login tidak ditemukan. Masuk kembali lalu periksa riwayat pesanan.");
      return;
    }

    let stopped = false;
    let attempts = 0;
    let terminal = false;
    const check = async () => {
      if (terminal) return;
      try {
        const response = await fetch(`/api/payments/status/${encodeURIComponent(orderId)}`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Status pembayaran belum dapat diperiksa.");
        if (stopped) return;
        setState(data);
        if (data.payment_status === "PAID") {
          terminal = true;
          setMessage("Pembayaran berhasil. Pesanan diteruskan ke toko.");
          return;
        }
        if (["FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(data.payment_status)) {
          terminal = true;
          setMessage("Pembayaran tidak berhasil atau pesanan dibatalkan.");
          return;
        }
        attempts += 1;
        setMessage(attempts > 1 ? "Menunggu konfirmasi pembayaran dari Midtrans..." : "Pembayaran sedang diverifikasi oleh Midtrans...");
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      }
    };
    void check();
    const timer = window.setInterval(() => {
      if (terminal) return;
      void check();
    }, 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  return (
    <main className="app-shell" style={{ paddingTop: 72, paddingBottom: 72 }}>
      <section className="impact-hero" style={{ maxWidth: 760, margin: "0 auto", display: "block" }}>
        <span className="eyebrow">PEMBAYARAN STILL GOOD</span>
        <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "clamp(28px, 3.1vw, 40px)", margin: "12px 0 8px" }}>
          Status <span style={{ color: "#e9a32e" }}>pesanan.</span>
        </h1>
        <p style={{ color: "#827e73", marginBottom: 24 }}>{error || message}</p>
        {state?.payment_status === "PAID" && (
          <div className="pin-box" style={{ margin: "18px 0" }}>
            <small>PIN PENGAMBILAN</small>
            <b>{state.pickup_pin}</b>
          </div>
        )}
        {state && <p style={{ color: "#827e73", marginBottom: 20 }}>Pesanan #{state.order_id} · {state.status}</p>}
        <Link href="/" className="primary-btn wide" style={{ display: "flex", justifyContent: "center", textDecoration: "none" }}>
          Kembali ke Still Good <span>→</span>
        </Link>
      </section>
    </main>
  );
}
