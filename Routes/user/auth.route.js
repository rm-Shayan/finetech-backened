import express from "express";
import { 
  signupUser, 
  loginUser, 
  updateUser, 
  deleteAccount, 
  logoutUser, 
  refreshTokens, 
  getUser ,
  forgotPassword,
  resetPassword,
  updatePassword
} from "../../controller/auth.controller.js";
import { getDashboard } from "../../controller/complaint.controller.js";
import { createRateLimiter } from "../../middlewares/rate-limiter.middleware.js";
import { upload } from "../../middlewares/multer.middleware.js";
import {jwtMiddleware } from "../../middlewares/jwt.middleware.js"
import { USER_ROLE } from "../../middlewares/roleBase.middleware.js";


const authRouteUser = express.Router();

// Public routes
authRouteUser.post(
  "/signup",
  createRateLimiter(3, 1), // 3 requests per minute
  signupUser
);

authRouteUser.post(
  "/login",
  createRateLimiter(5, 1), // 5 requests per minute
  loginUser
);

authRouteUser.post(
  "/forgot-password",
  createRateLimiter(3, 1), // 3 requests per minute
  forgotPassword
);

authRouteUser.post(
  "/reset-password",
  createRateLimiter(3, 1), // 3 requests per minute
  resetPassword
);

// Refresh tokens
authRouteUser.get("/refresh", refreshTokens);

// Protected routes (require JWT)
authRouteUser.use([jwtMiddleware,USER_ROLE]);

authRouteUser.get("/me", createRateLimiter(6, 1), getUser);

authRouteUser.patch(
  "/update",
  upload.single("avatar"), // single file upload (avatar)
  updateUser
);

// Update password (protected)
authRouteUser.post(
  "/update-password",
  createRateLimiter(3, 1),
  updatePassword
);

authRouteUser.delete("/delete", createRateLimiter(3, 1), deleteAccount);

authRouteUser.post("/logout", createRateLimiter(3, 1), logoutUser);

authRouteUser.get("/dashboard", createRateLimiter(5, 1), getDashboard);

export default authRouteUser;
