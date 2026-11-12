import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

try {
  for (const name of ["Makanan Berat", "Makanan Ringan", "Dessert", "Minuman"]) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name, active: true } });
  }

  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    const email = process.env.SEED_ADMIN_EMAIL.toLowerCase();
    const password = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, Number(process.env.BCRYPT_ROUNDS || 12));
    await prisma.user.upsert({
      where: { email },
      update: { role: "admin" },
      create: { name: process.env.SEED_ADMIN_NAME || "Administrator", email, password, role: "admin" },
    });
    console.log(`Admin seed tersedia: ${email}`);
  }
  console.log("Seed Still Good selesai.");
} finally {
  await prisma.$disconnect();
}
