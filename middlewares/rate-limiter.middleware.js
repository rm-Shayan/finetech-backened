// middlewares/rateLimiter.js
import rateLimit from "express-rate-limit";
import { ApiResponse } from "../utiLs/ApiResponse.js"; // make sure path is correct

/**
 * Returns a rate limiter middleware
 * @param {number} maxRequests - Maximum requests allowed
 * @param {number} windowMinutes - Time window in minutes
 * @param {string} message - Custom message when limit is exceeded
 */
export const createRateLimiter = (
  maxRequests = 100,
  windowMinutes = 15,
  message = "Too many requests, please try again later."
) => {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000, // convert minutes to ms
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, /*next*/) => {
      const response = new ApiResponse(429, null, message);
      res.status(429).json(response);
    },
  });
};
