import rateLimit from "express-rate-limit";
import multer from "multer";
import type { Request } from "express";
import ImageKit, { toFile } from "@imagekit/nodejs";
import type { AppConfig } from "../config/env.js";
import { AppError } from "./errors.js";
import { logger } from "./logger.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type DetectedImageType = {
  ext: "jpg" | "png" | "webp";
  mime: "image/jpeg" | "image/png" | "image/webp";
};

/**
 * UPL-1: Verifies actual image file signature (magic bytes), ignoring filename/MIME header.
 */
export function detectImageSignature(buffer: Buffer): DetectedImageType | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: "png", mime: "image/png" };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", mime: "image/webp" };
  }

  return null;
}

export interface UploadedFileResult {
  url: string;
  fileId: string;
}

export interface ImageStorageAdapter {
  upload(
    buffer: Buffer,
    fileName: string,
    folder: string
  ): Promise<UploadedFileResult>;
  deleteBestEffort(fileId: string): Promise<void>;
}

export function createImageKitStorage(config: AppConfig): ImageStorageAdapter {
  const client = new ImageKit({
    privateKey: config.IMAGEKIT_PRIVATE_KEY,
  });

  return {
    async upload(buffer, fileName, folder) {
      const fileObj = await toFile(buffer, fileName);
      const res = await client.files.upload({
        file: fileObj,
        fileName,
        folder,
        useUniqueFileName: true,
      });
      if (!res.url || !res.fileId) {
        throw new AppError(502, "UPLOAD_FAILED", "Image upload failed");
      }
      return { url: res.url, fileId: res.fileId };
    },
    async deleteBestEffort(fileId) {
      try {
        await client.files.delete(fileId);
      } catch (err) {
        logger.warn(
          { fileId, err: err instanceof Error ? err.message : "delete failed" },
          "Best-effort ImageKit delete failed"
        );
      }
    },
  };
}

export const memoryImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
  },
});

/**
 * UPL-1: 20 uploads per hour per authenticated user.
 */
export function createUploadRateLimiter(maxPerHour = 20) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: maxPerHour,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.user?.id ?? "anonymous",
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Upload rate limit exceeded. Maximum 20 uploads per hour.",
        },
      });
    },
  });
}
