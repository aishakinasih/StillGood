import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL belum diatur. Salin apps/api/.env.example menjadi apps/api/.env.");
}

const adapter = new PrismaPg({ connectionString });
export const prisma = globalForPrisma.__stillGoodPrisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.__stillGoodPrisma = prisma;
