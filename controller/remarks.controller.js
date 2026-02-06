import { asyncHandler } from "../utiLs/asyncHandler.js";
import { ApiError } from "../utiLs/ApiError.js";
import { ApiResponse } from "../utiLs/ApiResponse.js";
import { Remark } from "../models/remarks.model.js";
import { Complaint } from "../models/complaint.model.js";
import { sanitizeRemark } from "../utiLs/remarksSanitizer.js";
import redisClient from "../config/redis.js";
import mongoose from "mongoose";

export const getComplaintRemarks = asyncHandler(async (req, res) => {
  const { id: complaintId } = req.params; // optional
  const { complaintNo, status } = req.query; // complaintNo optional, status optional
  const userId = req.user._id;
  const userRole = req.user.role; // 'user' or 'bank_officer'

  if (!complaintId && !complaintNo) {
    throw new ApiError(400, "Provide complaint ID or complaintNo");
  }

  // ===== Fetch complaint =====
  const complaintQuery = { isDeleted: { $ne: true } };
  if (complaintId) complaintQuery._id = complaintId;
  if (complaintNo) complaintQuery.complaintNo = complaintNo;

  const complaint = await Complaint.findOne(complaintQuery);
  if (!complaint) throw new ApiError(404, "Complaint not found");

  console.log("id",userId,complaint.userId)

// ===== Role-based access =====
const remarkQuery = { complaintId: complaint._id };

if (userRole === "customer") {
  if (!complaint.userId.equals( new mongoose.Types.ObjectId(userId))) {
    throw new ApiError(
      403,
      "Unauthorized: This complaint does not belong to you"
    );
  }
} else if (userRole === "bank_officer") {
  if (!complaint.bankId.equals(new mongoose.Types.ObjectId(req.user.bankId))) {
    throw new ApiError(
      403,
      "Unauthorized: This complaint is not in your bank"
    );
  }
  remarkQuery.actionBy =new mongoose.Types.ObjectId(userId); // only officer's own remarks
} else {
  throw new ApiError(403, "Invalid role");
}

  // ===== Status filter mapping =====
  const allowedStatuses = ["closed", "rejected", "resolved", "escalated"];
  const statusMap = {
    closed: "user_close",
    rejected: "bank_officer_rejected",
    resolved: "bank_officer_resolved",
    escalated: "bank_officer_escalated",
  };
  if (status && allowedStatuses.includes(status)) {
    remarkQuery.actionType = statusMap[status];
  }

  // ===== Redis caching =====
  const redisKey = `remarks:${complaint._id}${
    complaintNo ? `:no:${complaintNo}` : ""
  }${status ? `:status:${status}` : ""}${
    userRole === "bank_officer" ? `:officer:${userId}` : ""
  }`;
  let remarks = [];

  try {
    const type = await redisClient.type(redisKey);
    if (type === "list") {
      const cached = await redisClient.lRange(redisKey, 0, -1);
      remarks = cached.map((r) => JSON.parse(r));
    }
  } catch {
    remarks = [];
  }

  if (!remarks.length) {
    remarks = await Remark.find(remarkQuery).sort({ createdAt: 1 }).lean();

    // Cache in Redis
    if (remarks.length) {
      const pipeline = redisClient.multi();
      remarks.forEach((r) => pipeline.rPush(redisKey, JSON.stringify(r)));
      pipeline.expire(redisKey, 86400); // 24h
      pipeline.exec().catch(() => {});
    }
  }

  const sanitizedRemarks = remarks.map(sanitizeRemark);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        complaintNo: complaint.complaintNo,
        currentStatus: complaint.status,
        totalRemarks: sanitizedRemarks.length,
        remarks: sanitizedRemarks,
      },
      "Remarks fetched successfully"
    )
  );
});
