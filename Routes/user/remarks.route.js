import express from "express";
import { getComplaintRemarks } from "../../controller/remarks.controller.js";
import { createRateLimiter } from "../../middlewares/rate-limiter.middleware.js";
import {jwtMiddleware } from "../../middlewares/jwt.middleware.js"
import {USER_ROLE } from "../../middlewares/roleBase.middleware.js";


const remarkUser = express.Router();

// Protected routes (require JWT)
remarkUser.use([jwtMiddleware,USER_ROLE]);

remarkUser.get("/:id", createRateLimiter(5, 1), getComplaintRemarks);
remarkUser.get("/", createRateLimiter(5, 1), getComplaintRemarks);




export default remarkUser;
