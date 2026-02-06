import { ApiError } from "./ApiError.js";

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((error) =>
    next(
      error instanceof ApiError
        ? error
        : new ApiError(500, error.message || "Internal Server Error")
    )
  );
