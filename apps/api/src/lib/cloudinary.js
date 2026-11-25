import { v2 as cloudinary } from "cloudinary";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, "../../uploads");

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET)
);

if (hasCloudinaryConfig) {
  cloudinary.config({
    secure: true,
  });
}

const mimeToExt = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function uploadImage(file, folder = "general") {
  if (!file) return undefined;

  // Mode Production / Vercel: gunakan Cloudinary jika kredensial tersedia
  if (hasCloudinaryConfig) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "image",
        },
        (error, result) => {
          if (error) {
            const response = error.response;

            console.error("[Cloudinary upload detail]", {
              message: error.message,
              http_code: error.http_code,
              name: error.name,
              cloudinaryMessage:
                error.error?.message ??
                response?.body?.error?.message ??
                response?.body?.message ??
                null,
              xCldError:
                response?.headers?.["x-cld-error"] ??
                response?.headers?.get?.("x-cld-error") ??
                null,
            });

            return reject(error);
          }

          resolve(result.secure_url);
        }
      );

      stream.end(file.buffer);
    });
  }

  // Mode Lokal / Docker: simpan ke folder uploads/ jika API key Cloudinary kosong
  const safeFolder = String(folder).replace(/[^a-zA-Z0-9/_-]/g, "");
  const targetDir = path.join(uploadsRoot, safeFolder);
  await fs.mkdir(targetDir, { recursive: true });

  const ext = mimeToExt[file.mimetype] || ".jpg";
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  await fs.writeFile(path.join(targetDir, filename), file.buffer);

  return `/uploads/${safeFolder}/${filename}`;
}

export default cloudinary;