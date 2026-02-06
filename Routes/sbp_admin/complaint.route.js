import { getAllComplaintBySbp_admin ,getComplaintById} from "../../controller/complaint.controller.js";
import { createRateLimiter } from "../../middlewares/rate-limiter.middleware.js";
import { jwtMiddleware } from "../../middlewares/jwt.middleware.js";
import { SBP_ADMIN_ROLE } from "../../middlewares/roleBase.middleware.js";
import express from "express";

const complaintRouteSBP = express.Router();

complaintRouteSBP.use([jwtMiddleware, SBP_ADMIN_ROLE]);

complaintRouteSBP.get("/", createRateLimiter(5, 1), getAllComplaintBySbp_admin);
complaintRouteSBP.get("/:id", createRateLimiter(5, 1), getComplaintById);
export default complaintRouteSBP;
