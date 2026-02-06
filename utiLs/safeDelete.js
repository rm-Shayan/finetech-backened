import fs from "fs";
import path from "path";

export const safeDeleteFile = async (filePath) => {
  try {
    if (!filePath) return;

    // Normalize (cross-platform)
    const normalizedPath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.normalize(path.join(process.cwd(), filePath));

    // Prevent path traversal
    const projectRoot = process.cwd();
    if (!normalizedPath.startsWith(projectRoot)) {
      console.warn("⚠️ Attempt to delete file outside project root:", normalizedPath);
      return;
    }

    // Check and delete
    if (fs.existsSync(normalizedPath)) {
      await new Promise((res) => setTimeout(res, 150)); // prevent locked file errors
      fs.unlinkSync(normalizedPath);
      console.log("🗑️ File deleted successfully:", normalizedPath);
    } else {
      console.warn("⚠️ File not found for deletion:", normalizedPath);
    }
  } catch (err) {
    console.error("❌ Error deleting file:", err.message);
  }
};
