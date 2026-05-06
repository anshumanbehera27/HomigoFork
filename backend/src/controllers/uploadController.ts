import type { Request, Response } from "express";
import { cloudinary } from "../config/cloudinary.js";
import { env } from "../config/env.js";
import { sendError } from "../utils/http.js";

/**
 * POST /api/upload
 * Accepts multipart/form-data with a single "file" field.
 * Uploads the image to Cloudinary and returns the secure URL.
 * The caller stores that URL in whatever Supabase column it needs.
 */
export async function uploadImage(req: Request, res: Response) {
  try {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      return res.status(503).json({ error: "Cloudinary is not configured on this server" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file provided. Send a multipart/form-data request with a 'file' field." });
    }

    const folder = (req.query.folder as string) || "homigo";

    const url = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "image" },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error("Cloudinary upload failed"));
          resolve(result.secure_url);
        },
      );
      stream.end(req.file!.buffer);
    });

    res.json({ success: true, url });
  } catch (error) {
    sendError(res, error);
  }
}
