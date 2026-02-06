import jwt from "jsonwebtoken";
import { ApiError } from "./ApiError.js";

/**
 * Verify a JWT token asynchronously
 * @param {string} token - JWT token
 * @param {string} secret - JWT secret key
 * @returns {Promise<Object>} - Decoded token payload
 * @throws {ApiError} - Throws ApiError if token is invalid or expired
 */
export const jwtVerify = async (token, secret) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        // Use ApiError for consistent error handling in your app
        reject(new ApiError(401, "Invalid or expired token"));
      } else {
        resolve(decoded);
      }
    });
  });
};
