import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import {
  CLOUDINARY_CLOUDNAME,
CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_PRESET,
} from "../contants.js";
import { ApiError } from "../utiLs/ApiError.js";
import { safeDeleteFile } from "../utiLs/safeDelete.js";

// ✅ Configure Cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUDNAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// ✅ Main Upload Function
export const uploadToCloudinary = async (filePath, folder = "TodoProfile") => {
  try {
    if (!filePath || typeof filePath !== "string") {
      throw new ApiError(400, "Invalid or missing file path");
    }

    // ✅ Handle absolute or relative paths safely
    const normalizedPath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.normalize(path.join(process.cwd(), filePath));

    if (!fs.existsSync(normalizedPath)) {
      throw new ApiError(404, "File not found on server");
    }

    // ✅ Check file size (10MB limit)
    const stats = fs.statSync(normalizedPath);
    const maxSizeMB = 10;
    if (stats.size > maxSizeMB * 1024 * 1024) {
      await safeDeleteFile(normalizedPath);
      throw new ApiError(400, `File size exceeds ${maxSizeMB}MB limit`);
    }

    // ✅ Validate file type
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
    const ext = path.extname(normalizedPath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      await safeDeleteFile(normalizedPath);
      throw new ApiError(400, "Invalid file type. Allowed: jpg, jpeg, png, webp, svg");
    }

    // ✅ Upload
    const result = await cloudinary.uploader.upload(normalizedPath, {
      folder,
      upload_preset: CLOUDINARY_PRESET,
      resource_type: "image",
    });

    console.log("✅ Cloudinary Upload Successful:", result.secure_url);

    // ✅ Remove local file
    await safeDeleteFile(normalizedPath);

    return {
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error("❌ Cloudinary Upload Failed:", error.message);
    await safeDeleteFile(filePath);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Cloudinary upload failed");
  }
};

/**
 * @desc Delete a file from Cloudinary by public_id
 * @param {string} publicId - The public_id of the Cloudinary file
 */
export const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) {
      throw new ApiError(400, "No public_id provided for deletion");
    }

    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result !== "ok" && result.result !== "not found") {
      throw new ApiError(500, "Failed to delete file from Cloudinary");
    }

    console.log(`✅ Cloudinary file deleted: ${publicId}`);
    return result;
  } catch (error) {
    console.error("❌ Cloudinary deletion failed:", error.message);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Cloudinary deletion error");
  }
};
