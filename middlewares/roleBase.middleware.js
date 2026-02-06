import { ApiError } from "../utiLs/ApiError.js";

export const USER_ROLE = (req, res, next) => {
  if (!req.user) return next(new ApiError(401, "Unauthorized request"));

  // Correct comparison
  if (req.user.role !== "customer") {
    return next(new ApiError(403, "Access denied"));
  }

  next();
};



export const BANK_OFFICER_ROLE = (req, res, next) => {
  if (!req.user) return next(new ApiError(401, "Unauthorized request"));
  if (req.user.role !== "bank_officer") {
    return next(new ApiError(403, "Only bank officers can access this route"));
  }
  next();
};

export const SBP_ADMIN_ROLE = (req, res, next) => {
  if (req.user?.role !== "sbp_admin") {
    return next(
      new ApiError(403, "Only SBP admins can access this route")
    );''
  }
  next();
};
