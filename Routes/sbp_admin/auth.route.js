import express from "express";
import {
  loginUser,
  signupUser,
  refreshTokens,
  deleteAccount,
  logoutUser,
  updateUser,
  getUser,
  getAllBankOfficers,
  getAllUsers,
  forgotPassword,
  resetPassword,
  updatePassword,
} from "../../controller/auth.controller.js";
import { getDashboard } from "../../controller/complaint.controller.js";
import { createRateLimiter } from "../../middlewares/rate-limiter.middleware.js";
import { upload } from "../../middlewares/multer.middleware.js";
import { jwtMiddleware } from "../../middlewares/jwt.middleware.js";
import { SBP_ADMIN_ROLE } from "../../middlewares/roleBase.middleware.js";

const authRouteSBP = express.Router();

/* ========== PUBLIC ROUTES ========== */

authRouteSBP.post("/login", createRateLimiter(5, 1), loginUser);

authRouteSBP.post(
  "/forgot-password",
  createRateLimiter(3, 1), // 3 requests per minute
  forgotPassword,
);

authRouteSBP.post(
  "/reset-password",
  createRateLimiter(3, 1), // 3 requests per minute
  resetPassword,
);

authRouteSBP.get("/refresh", createRateLimiter(10, 1), refreshTokens);

/* ========== PROTECTED ROUTES (SBP ADMIN ONLY) ========== */
authRouteSBP.use([jwtMiddleware, SBP_ADMIN_ROLE]);

/* ========== CURRENT SBP ADMIN ROUTES ========== */
authRouteSBP.get("/me", createRateLimiter(6, 1), getUser);

authRouteSBP.post("/register-bank-officer", signupUser);

// Update password (protected)
authRouteSBP.post("/update-password", createRateLimiter(3, 1), updatePassword);

authRouteSBP.patch("/update", upload.single("avatar"), updateUser);

authRouteSBP.delete("/delete", createRateLimiter(3, 1), deleteAccount);

authRouteSBP.post("/logout", createRateLimiter(3, 1), logoutUser);

/* ========== NEW SBP ADMIN USER FETCH ROUTES ========== */

// Get all bank officers, optional ?bankCode=XYZ
authRouteSBP.get(
  "/users/bank-officers",
  createRateLimiter(5, 1),
  getAllBankOfficers,
);

// Get all users (excluding sbp_admin), optional ?bankCode=XYZ
authRouteSBP.get("/users/all", createRateLimiter(5, 1), getAllUsers);

authRouteSBP.get("/dashboard", createRateLimiter(5, 1), getDashboard);

export default authRouteSBP;
