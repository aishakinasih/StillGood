import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const rl = readline.createInterface({ input, output });

async function ask(label) {
  return (await rl.question(label)).trim();
}

try {
  console.log("\nProvision akun penjual Still Good (khusus operator).\nAkun ini tidak dibuat melalui halaman registrasi publik.\n");
  const name = await ask("Nama penjual: ");
  const email = (await ask("Email penjual: ")).toLowerCase();
  const phone = await ask("Nomor HP: ");
  const storeName = await ask("Nama toko: ");
  const storeAddress = await ask("Alamat toko: ");
  const password = await ask("Password sementara (minimal 8 karakter): ");

  if (!name || !email || !phone || !storeName || !storeAddress || password.length < 8) {
    throw new Error("Semua data wajib diisi dan password minimal 8 karakter.");
  }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new Error("Email sudah terdaftar. Gunakan email lain atau kelola akun yang sudah ada.");

  const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 12));
  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      password: hash,
      role: "seller",
      store: { create: { name: storeName, address: storeAddress, phone } },
    },
    include: { store: true },
  });
  console.log(`\nAkun penjual berhasil dibuat: ${user.email}`);
  console.log(`ID pengguna: ${user.id} | ID toko: ${user.store?.id}`);
  console.log("Sampaikan kredensial sementara kepada pemilik toko melalui kanal yang aman.");
} finally {
  rl.close();
  await prisma.$disconnect();
}
