import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";

const secret = () => process.env.JWT_SECRET;

export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new HttpError(401, "Silakan masuk terlebih dahulu.");
    if (!secret() || secret().length < 32) throw new Error("JWT_SECRET harus berisi minimal 32 karakter.");
    const payload = jwt.verify(token, secret(), { algorithms: ["HS256"] });
    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user || user.role !== payload.role) throw new HttpError(401, "Sesi tidak valid. Silakan masuk kembali.");
    req.user = user;
    req.authToken = token;
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "Token sesi tidak valid atau telah kedaluwarsa."));
  }
}

export function allowRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, "Kamu tidak memiliki izin untuk melakukan tindakan ini."));
    next();
  };
}

export function createToken(user) {
  return jwt.sign({ email: user.email, role: user.role }, secret(), {
    subject: String(user.id),
    algorithm: "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}
