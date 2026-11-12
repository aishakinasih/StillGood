import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Still Good — Selamatkan makanan, nikmati lebih hemat",
  description: "Marketplace makanan surplus Still Good. Temukan makanan layak konsumsi dengan harga lebih hemat.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <head>
        <meta name="csrf-token" content="" />
        <meta name="theme-color" content="#fff0cf" />
      </head>
      <body>{children}</body>
    </html>
  );
}
