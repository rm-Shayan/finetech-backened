import {
  getBankOfficerComplaints,
  updateComplaintStatusByBank_Officer,
  getComplaintById,
} from "../../controller/complaint.controller.js";
import { createRateLimiter } from "../../middlewares/rate-limiter.middleware.js";
import { jwtMiddleware } from "../../middlewares/jwt.middleware.js";
import { BANK_OFFICER_ROLE } from "../../middlewares/roleBase.middleware.js";
import express from "express";

const complaintRouteBankOfficer = express.Router();

complaintRouteBankOfficer.use([jwtMiddleware, BANK_OFFICER_ROLE]);

complaintRouteBankOfficer.get(
  "/",
  createRateLimiter(5, 1),
  getBankOfficerComplaints,
);
complaintRouteBankOfficer.get(
  "/:id",
  createRateLimiter(5, 1),
  getComplaintById,
);
complaintRouteBankOfficer.patch(
  "/update/:id",
  createRateLimiter(7, 1),
  updateComplaintStatusByBank_Officer,
);

export default complaintRouteBankOfficer;
