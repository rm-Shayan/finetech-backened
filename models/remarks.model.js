import mongoose from "mongoose";

const remarksSchema = new mongoose.Schema({
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
    required: true,
  },
  actionBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // user ya manager
    required: true,
  },
 actionType: {
  type: String,
  enum: [
    "user_close", 
    "bank_officer_resolved",
    "bank_officer_rejected",
    "bank_officer_escalated",

    "other"
  ],
  required: true,
}
,
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Remark = mongoose.model("Remark", remarksSchema);
