import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import multer from "multer";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import {
  createUploadRateLimiter,
  detectImageSignature,
  memoryImageUpload,
  type ImageStorageAdapter,
} from "../../lib/upload.js";

export function createUploadsRouter(
  authenticate: RequestHandler,
  storage: ImageStorageAdapter,
  uploadLimitPerHour = 20
): Router {
  const router = Router();
  const uploadRateLimiter = createUploadRateLimiter(uploadLimitPerHour);

  router.post(
    "/image",
    authenticate,
    uploadRateLimiter,
    (req: Request, res: Response, next: NextFunction) => {
      memoryImageUpload.single("file")(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            next(new AppError(422, "UPLOAD_INVALID", "Image exceeds 5 MB limit"));
            return;
          }
          next(new AppError(400, "UPLOAD_INVALID", err.message));
          return;
        }
        if (err) {
          next(err);
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file?.buffer) {
          throw new AppError(422, "UPLOAD_INVALID", "Image file is required");
        }
        const detected = detectImageSignature(req.file.buffer);
        if (!detected) {
          throw new AppError(
            422,
            "UPLOAD_INVALID",
            "Only valid JPEG, PNG, or WebP images are allowed"
          );
        }

        const folder =
          typeof req.body?.folder === "string" &&
          /^[a-zA-Z0-9_-]{1,32}$/.test(req.body.folder)
            ? `/skillconnect/${req.body.folder}`
            : "/skillconnect/uploads";

        const fileName = `img-${Date.now()}.${detected.ext}`;
        const uploaded = await storage.upload(req.file.buffer, fileName, folder);
        sendSuccess(res, uploaded, 201);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
