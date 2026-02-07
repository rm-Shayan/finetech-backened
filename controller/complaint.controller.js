import fs from "fs/promises";
import { PDFParse } from "pdf-parse";
import { ApiError } from "../utiLs/ApiError.js";
import { ApiResponse } from "../utiLs/ApiResponse.js";
import { asyncHandler } from "../utiLs/asyncHandler.js";
import { Complaint } from "../models/complaint.model.js";
import { sendMail } from "../services/email.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../services/cloudinary.js";
import redisClient from "../config/redis.js";
import { Remark } from "../models/remarks.model.js";
import { v4 as uuidv4 } from "uuid";
import { sanitizeComplaint } from "../utiLs/complaintSanitizer.js";
import { sanitizeRemark } from "../utiLs/remarksSanitizer.js";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";

// user complaint route
export const submitComplaint = asyncHandler(async (req, res) => {
  /* ================= BASIC DATA ================= */
  const { type, category, priority, description } = req.body;
  const { _id: userId, bankId, email: userEmail } = req.user || {};

  if (!userId || !bankId) {
    throw new ApiError(400, "User or Bank information missing");
  }

  /* ================= DESCRIPTION ================= */
  let finalDescription = description?.trim() || "";
  const attachments = [];

  const pdfFile = req.files?.pdf?.[0];

  if (!finalDescription && pdfFile) {
    try {
      const parser = new PDFParse({ url: pdfFile.path });
      const { text } = await parser.getText();

      finalDescription = text?.replace(/\s+/g, " ")?.trim()?.slice(0, 2000);
    } finally {
      fs.unlink(pdfFile.path).catch(() => {});
    }
  }

  if (!finalDescription || finalDescription.length < 20) {
    throw new ApiError(
      400,
      "Description text or valid PDF is required (min 20 characters)",
    );
  }

  /* ================= ATTACHMENTS ================= */
  const images = req.files?.attachments || [];

  if (images.length) {
    const uploadedAttachments = await Promise.all(
      images.map(async (file) => {
        try {
          const { url, public_id } = await uploadToCloudinary(
            file.path,
            "complaints/attachments",
          );

          // Ensure result has secure_url & public_id

          console.log("result", "url", url, "public id", public_id);
          return { url, public_id };
        } catch (err) {
          fs.unlink(file.path).catch(() => {});
          console.error("Attachment upload failed:", err.message);
          return null;
        }
      }),
    );

    // Only push valid attachments
    attachments.push(...uploadedAttachments.filter((att) => att !== null));

    console.log("attachments after looping:", attachments);
  }

  console.log("after looping", attachments);
  /* ================= COMPLAINT NO ================= */
  const complaintNo = `CMP-${new Date().getFullYear()}-${uuidv4().toUpperCase()}`;

  /* ================= DB SAVE (CRITICAL) ================= */
  const complaint = await Complaint.create({
    complaintNo,
    userId,
    bankId,
    type,
    category,
    priority,
    description: finalDescription,
    attachments,
  });

  /* ================= REDIS (NON-BLOCKING) ================= */
  try {
    const pipeline = redisClient.multi();

    const id = complaint._id.toString();
    const status = complaint.status;
    const pr = complaint.priority;

    const keys = [
      `user:${userId}:complaints:ids`,
      `user:${userId}:complaints:ids:status:${status}`,
      `user:${userId}:complaints:ids:priority:${pr}`,
      `user:${userId}:complaints:ids:status:${status}:priority:${pr}`,
    ];

    keys.forEach((key) => {
      pipeline.sAdd(key, id); // avoids duplicates automatically
      pipeline.expire(key, 86400);
    });

    pipeline.exec().catch(() => {});
  } catch {
    // ignore redis failure
  }

  /* ================= EMAIL (NON-BLOCKING) ================= */
  if (userEmail) {
    sendMail({
      to: userEmail,
      subject: "Complaint Registered Successfully",
      html: `
        <h3>Complaint Registered</h3>
        <p>Your complaint has been successfully registered.</p>
        <p><strong>Complaint No:</strong> ${complaintNo}</p>
        <p>Status: Pending</p>
      `,
    }).catch(() => {});
  }

  const sanitizedComplaint = sanitizeComplaint(complaint.toObject());
  /* ================= RESPONSE ================= */
  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        sanitizedComplaint,
        "Complaint submitted successfully",
      ),
    );
});

export const getUserComplaints = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { status, priority } = req.query;

  const arrPriority = ["low", "medium", "high"];
  const arrStatus = [
    "pending",
    "assigned",
    "in_progress",
    "resolved",
    "rejected",
    "escalated",
  ];

  if (
    (status && !arrStatus.includes(status)) ||
    (priority && !arrPriority.includes(priority))
  ) {
    throw new ApiError(400, "Please provide valid status or priority");
  }

  const baseKey = `user:${userId}:complaints:ids`;
  let redisKey = baseKey;

  if (status && priority)
    redisKey = `${baseKey}:status:${status}:priority:${priority}`;
  else if (status) redisKey = `${baseKey}:status:${status}`;
  else if (priority) redisKey = `${baseKey}:priority:${priority}`;

  // ensure key type
  const keyType = await redisClient.type(redisKey);
  if (keyType !== "set") await redisClient.del(redisKey).catch(() => {});

  let cachedIds = await redisClient.sMembers(redisKey);
  let complaints = [];

  if (cachedIds.length) {
    complaints = await Complaint.find({
      _id: { $in: cachedIds },
      userId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  if (!complaints.length) {
    const query = { userId, isDeleted: false };
    if (status) query.status = status;
    if (priority) query.priority = priority;

    complaints = await Complaint.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // async cache write
    if (complaints.length) {
      const pipeline = redisClient.multi();

      complaints.forEach(({ _id, status, priority }) => {
        const id = _id.toString();
        const keys = [
          baseKey,
          `${baseKey}:status:${status}`,
          `${baseKey}:priority:${priority}`,
          `${baseKey}:status:${status}:priority:${priority}`,
        ];
        keys.forEach((k) => {
          pipeline.sAdd(k, id);
          pipeline.expire(k, 86400);
        });
      });

      pipeline.exec().catch(() => {});
    }
  }

  // -------------------------
  // ✅ FETCH REMARKS IN BATCH
  // -------------------------
const needRemarksIds = complaints.map((c) => c._id);

let remarksMap = {};

if (needRemarksIds.length) {
  const remarks = await Remark.find({
     complaintId: { $in: needRemarksIds },
  }).lean();

  remarks.forEach((r) => {
    remarksMap[r.complaintId.toString()] = sanitizeRemark(r);
  });
}

  // attach remark
  complaints = complaints.map((c) => ({
    ...c,
    remark:remarksMap?.[c._id.toString()] ?? null,
  }));

  // -------------------------
  // PAGINATION (after sort)
  // -------------------------
  const pagedComplaints = complaints.slice(skip, skip + limit);
  const sanitizedComplaints = pagedComplaints.map(sanitizeComplaint);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        page,
        limit,
        count: complaints.length,
        filters: { status: status || "ALL", priority: priority || "ALL" },
        complaints: sanitizedComplaints,
      },
      "User complaints fetched successfully"
    )
  );
});

export const updateComplaintByUser = asyncHandler(async (req, res) => {
  
  console.log("req,body",req.body)
  if (!req?.body)
    return new ApiError(400, "body is required (particularly description)");
  if (!req?.params)
    return new ApiError(400, "params required (particularly id in params )");

  const { id } = req.params;

  const { description } = req.body;
  const userId = req.user._id;

  console.log("req,body",req.body)
  const complaint = await Complaint.findById(id);

  if (!complaint) {
    throw new ApiError(404, "Complaint not found");
  }

  /* ========== OWNERSHIP ========== */
  if (complaint.userId.toString() !== userId.toString()) {
    throw new ApiError(403, "Unauthorized");
  }

  /* ========== STATUS CHECK ========== */
  if (complaint.status !== "pending") {
    throw new ApiError(400, "Complaint can only be updated while pending");
  }

  /* ========== DESCRIPTION ========== */
  if (description) {
    const trimmed = description.trim();
    if (trimmed.length < 20) {
      throw new ApiError(400, "Description must be at least 20 characters");
    }
    console.log("description hai");
    complaint.description = trimmed;
  }

  /* ========== ATTACHMENTS (REPLACE MODE) ========== */
  const files = req.files?.attachments || [];
   if (files.length > 0) {
  // delete old evidence if exists
  if (Array.isArray(complaint.attachments) && complaint.attachments.length) {
    await Promise.all(
      complaint.attachments
        .filter(att => att?.public_id)
        .map(att => deleteFromCloudinary(att.public_id))
    );
  }

  // sequential upload for stability
  let uploaded = [];
  for (const file of files) {
    try {
      const { url, public_id } = await uploadToCloudinary(file.path, "complaints/attachments");
      uploaded.push({ url, public_id, uploadedBy: userId, uploadedAt: new Date() });
    } finally {
      fs.unlink(file.path).catch(() => {});
    }
  }

  complaint.attachments = uploaded;
} else {
  console.log("No new attachments, skipping upload.");
}
  
  /* ========== NOTHING TO UPDATE CHECK (OPTIONAL) ========== */
  if (!description && !files.length) {
    throw new ApiError(400, "Nothing to update");
  }

  await complaint.save();

  const sanitizedComplaint = sanitizeComplaint(complaint.toObject());
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        sanitizedComplaint,
        "Complaint updated successfully",
      ),
    );
});

export const deleteComplaint = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const complaint = await Complaint.findById(id);

  if (!complaint) {
    throw new ApiError(404, "Complaint not found");
  }

  /* ========== OWNERSHIP CHECK ========== */
  if (complaint.userId.toString() !== userId.toString()) {
    throw new ApiError(403, "Unauthorized");
  }

  /* ========== ALREADY DELETED CHECK ========== */
  if (complaint.isDeleted) {
    throw new ApiError(400, "Complaint already deleted");
  }

  /* ========== STATUS RULE ========== */
  if (complaint.status !== "pending") {
    throw new ApiError(400, "Only pending complaints can be deleted");
  }

  /* ========== SOFT DELETE ========== */
  complaint.isDeleted = true;
  complaint.deletedAt = new Date();
  complaint.deletedBy = userId;

  await complaint.save();

  /* ========== REDIS CLEANUP (NON-BLOCKING) ========== */
  try {
    const idStr = complaint._id.toString();
    const status = complaint.status;
    const priority = complaint.priority;

    const keys = [
      `user:${userId}:complaints:ids`,
      `user:${userId}:complaints:ids:status:${status}`,
      `user:${userId}:complaints:ids:priority:${priority}`,
      `user:${userId}:complaints:ids:status:${status}:priority:${priority}`,
    ];

    const pipeline = redisClient.multi();
    keys.forEach((key) => pipeline.sRem(key, idStr));
    pipeline.exec().catch(() => {});
  } catch {
    // ignore redis failure
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Complaint deleted successfully"));
});

export const closeComplaintByUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user._id;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid complaint ID");
  }

  // Use findOne instead of find
  const complaint = await Complaint.findOne({
    _id: new mongoose.Types.ObjectId(id),
  });

  if (!complaint) {
    throw new ApiError(404, "Complaint not found");
  }

  /* ========== OWNERSHIP CHECK ========== */
  if (!complaint.userId || complaint.userId.toString() !== userId.toString()) {
    throw new ApiError(403, "Unauthorized");
  }

  /* ========== STATUS VALIDATION ========== */
  const allowedStatuses = ["pending", "assigned"];
  if (!allowedStatuses.includes(complaint.status)) {
    throw new ApiError(400, "Complaint cannot be closed at this stage");
  }

  /* ========== CLOSE COMPLAINT ========== */
  complaint.status = "closed";
  complaint.closedAt = new Date();
  await complaint.save();

  /* ========== CREATE REMARK ========= */
  const remark = await Remark.create({
    complaintId: complaint._id,
    actionBy: userId,
    actionType: "user_close",
    reason: reason?.trim() || "Closed by user",
  });

  /* ========== EMAIL NOTIFICATION ========= */
  if (req.user.email) {
    await sendMail({
      to: req.user.email,
      subject: `Complaint ${complaint.complaintNo} Closed Successfully`,
      html: `
        <h3>Complaint Status Updated</h3>
        <p>Complaint No: <strong>${complaint.complaintNo}</strong></p>
        <p>Status: <strong>${complaint.status}</strong></p>
        <p>Closed At: <strong>${complaint.closedAt?.toLocaleString()}</strong></p>
        <p>Reason: <strong>${remark.reason}</strong></p>
        <hr />
        <p>Thank you for using our complaint management system.</p>
      `,
    });
  }

  const sanitizedComplaint = sanitizeComplaint(complaint.toObject());
  const sanitizedRemark = sanitizeRemark(remark.toObject());

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { sanitizedComplaint, sanitizedRemark },
        "Complaint closed successfully",
      ),
    );
});

// BankOfficer comaplint route

//get all camplaints for bankOfficer by bankId means user bank id or complaint bankid agr match krjaein tu leana saare or jis trha professional me hota hai 20 02 kr k laana or satus kr k means user jis ko get  krna chahta hai wo wali or redis me bhi wo rkhna data smjhe
export const getBankOfficerComplaints = asyncHandler(async (req, res) => {
  const bankId = req.user.bankId;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const statusFilter = req.query.status;

  const allowedStatus = [
    "pending",
    "assigned",
    "in_progress",
    "resolved",
    "rejected",
    "escalated",
    "closed",
  ];

  if (statusFilter && !allowedStatus.includes(statusFilter)) {
    throw new ApiError(400, "Invalid status filter");
  }

  const baseKey = `bankOfficer:${bankId}:complaints:ids`;
  let redisKey = statusFilter ? `${baseKey}:status:${statusFilter}` : baseKey;

  // ===== Redis hit check =====
  let cachedIds = [];
  try {
    const type = await redisClient.type(redisKey);
    if (type === "set") {
      cachedIds = await redisClient.sMembers(redisKey);
    }
  } catch {
    cachedIds = [];
  }

  // ===== DB Query =====
  const query = { bankId, isDeleted: { $ne: true } };
  if (statusFilter) query.status = statusFilter;

  let complaints = [];
  if (cachedIds.length) {
    complaints = await Complaint.find({ _id: { $in: cachedIds }, ...query })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  } else {
    complaints = await Complaint.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Populate Redis asynchronously
    if (complaints.length) {
      const pipeline = redisClient.multi();
      complaints.forEach(({ _id, status }) => {
        const id = _id.toString();
        const keys = [baseKey, `${baseKey}:status:${status}`];
        keys.forEach((key) => {
          pipeline.sAdd(key, id);
          pipeline.expire(key, 86400);
        });
      });
      pipeline.exec().catch(() => {});
    }
  }

  // ===== Auto update pending → in_progress =====
  const pendingIds = complaints
    .filter((c) => c.status === "pending")
    .map((c) => c._id);

  if (pendingIds.length) {
    const updated = await Complaint.updateMany(
      { _id: { $in: pendingIds } },
      { $set: { status: "in_progress", in_progressAt: new Date() } },
      { new: true },
    );

    // Lookup users to trigger email
    const users = await User.find({
      _id: { $in: complaints.map((c) => c.userId) },
      isDeleted: false,
    }).select("email _id");

    // Trigger emails
    complaints.forEach((c) => {
      if (pendingIds.includes(c._id)) {
        const user = users.find(
          (u) => u._id.toString() === c.userId.toString(),
        );
        if (user?.email) {
          sendMail({
            to: user.email,
            subject: `Your Complaint ${c.complaintNo} is now In Progress`,
            html: `
              <h3>Complaint Status Updated</h3>
              <p>Complaint No: <strong>${c.complaintNo}</strong></p>
              <p>Status: <strong>In Progress</strong></p>
              <p>Assigned At: <strong>${new Date().toLocaleString()}</strong></p>
              <hr />
              <p>Thank you for using our complaint management system.</p>
            `,
          }).catch(() => {});
        }
      }
    });

    // Update local objects for response
    complaints = complaints.map((c) =>
      pendingIds.includes(c._id)
        ? { ...c.toObject(), status: "in_progress", in_progressAt: new Date() }
        : c.toObject(),
    );
  } else {
    complaints = complaints.map((c) => c.toObject());
  }

  // ===== Remarks handling if admin rejected/closed/etc =====
  for (const c of complaints) {
    if (["rejected", "closed"].includes(c.status) && !c.remarks) {
      // Example: assume remarks provided in DB or passed separately
      const remark = await Remark.findOne({ complaintId: c._id }).lean();
      if (remark) {
        c.remark = sanitizeRemark(remark);

        // Trigger email for user
        const user = await User.findById(c.userId).select("email");
        if (user?.email) {
          sendMail({
            to: user.email,
            subject: `Complaint ${c.complaintNo} ${c.status}`,
            html: `
              <h3>Complaint Status Updated</h3>
              <p>Complaint No: <strong>${c.complaintNo}</strong></p>
              <p>Status: <strong>${c.status}</strong></p>
              <p>Reason: ${remark.reason}</p>
              <hr />
              <p>Thank you for using our complaint management system.</p>
            `,
          }).catch(() => {});
        }
      }
    }
  }

  // ===== Sanitize complaints =====
  const sanitizedComplaints = complaints.map(sanitizeComplaint);

  // ===== Total count =====
  const totalCount = await Complaint.countDocuments(query);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        complaints: sanitizedComplaints,
      },
      "Bank Officer complaints fetched successfully",
    ),
  );
});

export const updateComplaintStatusByBank_Officer = asyncHandler(
  async (req, res) => {
    const { id } = req.params; // complaint ID
    const { status, remark: reason } = req.body;
    const officerId = req.user._id;
    const officerBankId = req.user.bankId;

    const allowedStatuses = [
      "in_progress",
      "resolved",
      "rejected",
      "escalated",
    ];
    if (!allowedStatuses.includes(status)) {
      throw new ApiError(400, "Invalid status");
    }

    const complaint = await Complaint.findById(id);
    if (!complaint || complaint.isDeleted) {
      throw new ApiError(404, "Complaint not found");
    }

    // Ensure officer belongs to the same bank
    if (complaint.bankId.toString() !== officerBankId.toString()) {
      throw new ApiError(403, "Unauthorized to update this complaint");
    }

    // ===== Remark required logic =====
    const RESET_DATE = new Date(0);

    const prevStatus = complaint.status;

    const statusDateMap = {
      in_progress: "in_progressAt",
      resolved: "resolvedAt",
      rejected: "rejectedAt",
      escalated: "escalatedAt",
    };

    // ===== reset previous status date =====
    if (prevStatus && statusDateMap[prevStatus] && prevStatus !== status) {
      complaint[statusDateMap[prevStatus]] = RESET_DATE;
    }

    const requiresRemark =
      ["resolved", "rejected"].includes(status) &&
      ((prevStatus === "resolved" && status === "rejected") ||
        (prevStatus === "rejected" && status === "resolved") ||
        ["rejected", "escalated"].includes(status));

    if (requiresRemark && (!reason || reason.trim().length < 5)) {
      throw new ApiError(
        400,
        `Remark is required when status changes from ${prevStatus} → ${status}`,
      );
    }

    // ===== Update complaint status =====
    complaint.status = status;

    if (status === "in_progress") complaint.in_progressAt = new Date();
    if (status === "resolved") complaint.resolvedAt = new Date();
    if (status === "rejected") complaint.rejectedAt = new Date();
    if (status === "escalated") complaint.escalatedAt = new Date();

    await complaint.save();

    // ===== Create Remark if provided =====
    let remarkDoc = null;
    if (reason && reason.trim().length > 0) {
      remarkDoc = await Remark.create({
        complaintId: complaint._id,
        actionBy: officerId,
        actionType: `bank_officer_${status}`,
        reason: reason.trim(),
      });
    }

    // ===== Send email to user =====
    const user = await User.findById(complaint.userId).select("email");
    if (user?.email) {
      const remarkText = remarkDoc?.reason
        ? `<p>Remark: ${remarkDoc.reason}</p>`
        : "";
      await sendMail({
        to: user.email,
        subject: `Complaint ${complaint.complaintNo} ${status}`,
        html: `
        <h3>Your Complaint Status Updated</h3>
        <p>Complaint No: <strong>${complaint.complaintNo}</strong></p>
        <p>Status: <strong>${complaint.status}</strong></p>
        ${remarkText}
        <hr />
        <p>Thank you for using our complaint management system.</p>
      `,
      }).catch(() => {});
    }

    // ===== Sanitize response =====
    const sanitizedComplaint = sanitizeComplaint(complaint);
    const sanitizedRemark = remarkDoc ? sanitizeRemark(remarkDoc) : null;

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { complaint: sanitizedComplaint, remark: sanitizedRemark },
          "Complaint status updated successfully",
        ),
      );
  },
);

export const getDashboard = asyncHandler(async (req, res) => {
  const { role, _id: userId, bankId } = req.user;
  if (!role) throw new ApiError(400, "User role not found");

  const statuses = [
    "pending",
    "in_progress",
    "resolved",
    "rejected",
    "escalated",
    "assigned",
    "closed",
  ];

  let responseData = {};

  // ------------------- SBP Admin Dashboard -------------------
  if (role === "sbp_admin") {
    // Complaints stats
    const complaintStatsAgg = await Complaint.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const complaintStats = Object.fromEntries(statuses.map((s) => [s, 0]));
    complaintStatsAgg.forEach(
      (item) => (complaintStats[item._id] = item.count),
    );
    const totalComplaints = Object.values(complaintStats).reduce(
      (a, b) => a + b,
      0,
    );

    // Users summary in parallel
    const [totalUsers, bankOfficers, generalUsers] = await Promise.all([
      User.countDocuments({ isDeleted: false, role: { $ne: "sbp_admin" } }),
      User.countDocuments({ isDeleted: false, role: "bank_officer" }),
      User.countDocuments({
        isDeleted: false,
        role: { $nin: ["bank_officer", "sbp_admin"] },
      }),
    ]);

    responseData = {
      totalComplaints,
      complaintStats,
      usersSummary: { totalUsers, bankOfficers, generalUsers },
    };
  }

  // ------------------- Bank Officer Dashboard -------------------
  else if (role === "bank_officer") {
    if (!bankId) throw new ApiError(400, "Bank info missing for officer");
    const bankObjectId = new mongoose.Types.ObjectId(bankId);

    // Complaints stats + users summary in parallel
    const [complaintStatsAgg, usersCounts] = await Promise.all([
      Complaint.aggregate([
        { $match: { bankId: bankObjectId, isDeleted: { $ne: true } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Promise.all([
        User.countDocuments({
          bankId: bankObjectId,
          isDeleted: false,
          role: { $ne: "sbp_admin" },
        }),
        User.countDocuments({
          bankId: bankObjectId,
          isDeleted: false,
          role: "bank_officer",
        }),
        User.countDocuments({
          bankId: bankObjectId,
          isDeleted: false,
          role: { $nin: ["bank_officer", "sbp_admin"] },
        }),
      ]),
    ]);

    const complaintStats = Object.fromEntries(statuses.map((s) => [s, 0]));
    complaintStatsAgg.forEach(
      (item) => (complaintStats[item._id] = item.count),
    );
    const totalComplaints = Object.values(complaintStats).reduce(
      (a, b) => a + b,
      0,
    );

    const [totalUsers, bankOfficers, generalUsers] = usersCounts;

    // Last 7 days trend
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    const dailyTrend = await Complaint.aggregate([
      {
        $match: {
          bankId: bankObjectId,
          createdAt: { $gte: last7Days },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
          },
          in_progress: {
            $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    responseData = {
      totalComplaints,
      complaintStats,
      usersSummary: { totalUsers, bankOfficers, generalUsers },
      dailyTrend,
    };
  }

  // ------------------- General User Dashboard -------------------
  else {
    if (!userId) throw new ApiError(400, "User ID missing");
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const complaints = await Complaint.find({
      userId: userObjectId,
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .lean();

    const complaintStats = Object.fromEntries(statuses.map((s) => [s, 0]));
    complaints.forEach((c) => {
      complaintStats[c.status || "pending"] += 1;
    });

    const sanitizedComplaints = complaints.map((c) => ({
      _id: c._id,
      complaintNo: c.complaintNo,
      type: c.type,
      category: c.category,
      priority: c.priority,
      status: c.status,
      description: c.description,
      attachments: (c.attachments || []).map((a) => ({ url: a.url })),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      closedAt: c.closedAt || null,
      resolvedAt: c.resolvedAt || null,
    }));

    responseData = {
      totalComplaints: complaints.length,
      complaintStats,
      complaints: sanitizedComplaints,
    };
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, responseData, "Dashboard data fetched successfully"),
    );
});

//get All complaint

export const getAllComplaintBySbp_admin = asyncHandler(async (req, res) => {
  const {
    bankCode, // optional
    status, // optional filter
    page = 1,
    limit = 10,
    search, // optional complaintNo / user email
  } = req.query;

  /* ================= BASE MATCH ================= */
  const matchQuery = {
    isDeleted: { $ne: true }, // ONLY ignore deleted
  };

  /* ================= OPTIONAL FILTERS ================= */

  // status filter (pending, closed, resolved etc)
  if (status) {
    matchQuery.status = status;
  }

  /* ================= BANK FILTER ================= */
  if (bankCode) {
    const bank = await Bank.findOne({ bankCode }).select("_id");
    if (!bank) {
      throw new ApiError(404, "Bank not found for given bankCode");
    }
    matchQuery.bankId = bank._id;
  }

  /* ================= PAGINATION ================= */
  const skip = (Number(page) - 1) * Number(limit);

  /* ================= AGGREGATION ================= */
  const [complaints, totalComplaints] = await Promise.all([
    Complaint.aggregate([
      { $match: matchQuery },

      // join user
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      // join bank
      {
        $lookup: {
          from: "banks",
          localField: "bankId",
          foreignField: "_id",
          as: "bank",
        },
      },
      { $unwind: { path: "$bank", preserveNullAndEmptyArrays: true } },

      // optional search
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { complaintNo: { $regex: search, $options: "i" } },
                  { "user.email": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },

      // sanitize output
      {
        $project: {
          description: 1,
          complaintNo: 1,
          status: 1,
          priority: 1,
          type: 1,
          category: 1,
          createdAt: 1,
          updatedAt: 1,
          closedAt: 1,
          resolvedAt: 1,
          attachments: {
            $map: {
              input: "$attachments",
              as: "a",
              in: { url: "$$a.url" },
            },
          },
          user: {
            _id: "$user._id",
            name: "$user.name",
            email: "$user.email",
          },
          bank: {
            _id: "$bank._id",
            name: "$bank.bankName",
            bankCode: "$bank.bankCode",
          },
        },
      },
    ]),

    Complaint.countDocuments(matchQuery),
  ]);

  /* ================= RESPONSE ================= */
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalComplaints,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalComplaints / limit),
        complaints,
      },
      "All complaints fetched successfully (SBP Admin)",
    ),
  );
});

// GET /api/complaints/:id
export const getComplaintById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role, _id: userId, bankId } = req.user;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid complaint ID");
  }

  const complaint = await Complaint.findById(id).lean();

  if (!complaint || complaint.isDeleted) {
    throw new ApiError(404, "Complaint not found");
  }

  // ===== Ownership / Role check =====
  if (role === "user" && complaint.userId.toString() !== userId.toString()) {
    throw new ApiError(403, "Unauthorized");
  }

  if (
    role === "bank_officer" &&
    complaint.bankId.toString() !== bankId.toString()
  ) {
    throw new ApiError(403, "Unauthorized");
  }

  // ===== Attach remark if exists =====
  let remark = null;
  if (
    ["closed", "rejected", "resolved", "escalated"].includes(complaint.status)
  ) {
    const remarkDoc = await Remark.findOne({
      complaintId: complaint._id,
    }).lean();
    if (remarkDoc) remark = sanitizeRemark(remarkDoc);
  }

  const sanitizedComplaint = sanitizeComplaint(complaint);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { complaint: sanitizedComplaint, remark },
        "Complaint fetched successfully",
      ),
    );
});
