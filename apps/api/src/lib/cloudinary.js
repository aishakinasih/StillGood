
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  secure: true,
});

export async function uploadImage(file, folder) {
  if (!file) return undefined;

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

export default cloudinary;
