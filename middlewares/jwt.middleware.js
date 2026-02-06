import {jwtVerify} from "../utiLs/jwt-verify.js"
import { ApiError } from "../utiLs/ApiError.js";


export const jwtMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header or cookies
    let token = null;

    // From header: "Authorization: Bearer <token>"
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    // Alternatively, from cookie (if using cookie-parser)
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }


    if (!token) {
      throw new ApiError(401, "Authorization token missing");
    }

    console.log("token",token)
    // Verify token
    const decoded = await jwtVerify(token, process.env.JWT_ACCESS_SECRET);

    console.log("decode",decoded)
    // Attach user info to request object
    req.user = decoded;

    console.log("user",req.user)

    next(); // Proceed to next middleware or route
  } catch (err) {
    // If it's an ApiError, pass it directly; otherwise wrap unknown errors
    next(err instanceof ApiError ? err : new ApiError(401, "Invalid or expired token"));
  }
};
