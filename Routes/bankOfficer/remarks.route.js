import express from "express";
import { getComplaintRemarks } from "../../controller/remarks.controller.js";
import { createRateLimiter } from "../../middlewares/rate-limiter.middleware.js";
import {jwtMiddleware } from "../../middlewares/jwt.middleware.js"
import { BANK_OFFICER_ROLE } from "../../middlewares/roleBase.middleware.js";


const remarkBank_Officer = express.Router();

// Protected routes (require JWT)
remarkBank_Officer.use([jwtMiddleware,BANK_OFFICER_ROLE]);

remarkBank_Officer.get("/:id", createRateLimiter(5, 1), getComplaintRemarks);
remarkBank_Officer.get("/", createRateLimiter(5, 1), getComplaintRemarks);




export default remarkBank_Officer;
