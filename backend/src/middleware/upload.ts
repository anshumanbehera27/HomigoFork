import multer from "multer";
import { HttpError } from "../utils/http.js";
import type { Request } from "express";

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req: Request, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new HttpError(400, "Only image files are allowed") as unknown as null, false);
    }
    cb(null, true);
  },
});
