import express from "express";
import {
  loginUser,
  refreshTokens,
  deleteAccount,
  logoutUser,
  updateUser,
  getUser,
  updatePassword,
  forgotPassword,
  resetPassword,
  getAllUsers,

} from "../../controller/auth.controller.js"; // getDashboard agar complaint.controller me hai to import wahan se

import { getDashboard } from "../../controller/complaint.controller.js";
import { createRateLimiter } from "../../middlewares/rate-limiter.middleware.js";
import { upload } from "../../middlewares/multer.middleware.js";
import { jwtMiddleware } from "../../middlewares/jwt.middleware.js";
import { BANK_OFFICER_ROLE } from "../../middlewares/roleBase.middleware.js";

const authRouteBankOfficer = express.Router();

/* ======================
   PUBLIC ROUTES (Bank Officer)
====================== */
authRouteBankOfficer.post("/login", createRateLimiter(5, 1), loginUser);
authRouteBankOfficer.post(
  "/forgot-password",
  createRateLimiter(3, 1), // 3 requests per minute
  forgotPassword
);

authRouteBankOfficer.post(
  "/reset-password",
  createRateLimiter(3, 1), // 3 requests per minute
  resetPassword
);

authRouteBankOfficer.get("/refresh", createRateLimiter(10, 1), refreshTokens);


/* ======================
   PROTECTED ROUTES (Bank Officer)
====================== */
authRouteBankOfficer.use([jwtMiddleware, BANK_OFFICER_ROLE]);

authRouteBankOfficer.get("/me", createRateLimiter(6, 1), getUser);
authRouteBankOfficer.patch("/update", upload.single("avatar"), updateUser);
authRouteBankOfficer.delete("/delete", createRateLimiter(3, 1), deleteAccount);
authRouteBankOfficer.post("/logout", createRateLimiter(3, 1), logoutUser);

// Update password (protected)
authRouteBankOfficer.post(
  "/update-password",
  createRateLimiter(3, 1),
  updatePassword
);
/* ======================
   DASHBOARD & OTHER BANK OFFICER ROUTES
====================== */
authRouteBankOfficer.get("/dashboard", createRateLimiter(8, 1), getDashboard);

authRouteBankOfficer.get("/users",createRateLimiter(8,1),getAllUsers)
// Agar aur future me Bank Officer-specific routes add karne ho
// authRouteBankOfficer.get("/complaints", getBankOfficerComplaints);

export default authRouteBankOfficer;
