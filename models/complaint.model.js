import mongoose from "mongoose";

/**
 * Complaint Schema
 * Used by: Customer, Bank Officer, SBP Admin
 */

const complaintSchema = new mongoose.Schema(
  {
    complaintNo: {
      type: String,
      unique: true,
      required: true, // e.g. CMP-2025-00001
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    bankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bank",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "banking_service",
        "card_service",
        "loan_service",
        "digital_banking",
        "other",
      ],
      default: "banking_service",
      required: true,
    },

    category: {
      type: String,
      enum: [
        "fraud",
        "delay",
        "wrong_charges",
        "poor_service",
        "system_issue",
        "other",
      ],
      default: "poor_service",
      required: true,
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    status: {
      type: String,
      enum: [
        "pending",
        "assigned",
        "in_progress",
        "resolved",
        "rejected",
        "escalated",
        "closed",
      ],
      default: "pending",
      index: true,
    },

    description: {
      type: String,
      required: true,
      minlength: 20,
    },

    attachments: [
      {
        _id: false,
        url: { type: String }, // optional: original filename
        public_id: { type: String }, // Corrected from pulic_id
      },
    ],

    isDeleted:{
    type:Boolean, 
    default:false,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },
     
    closedAt:{
      type: Date,
      default: null,
    },
    assignedAt:{
      type: Date,
      default: null,
   },
    in_progressAt:{
      type: Date,
      default: null,
   },
   rejectedAt:{
      type: Date,
      default: null,
   },
   escalatedAt:{
     type: Date,
      default: null,
   },
    
  },
  {
    timestamps: true,
  }
);

/* ---------------- Indexes ---------------- */

complaintSchema.index({ userId: 1, bankId: 1 });
complaintSchema.index({ status: 1, priority: 1 });

export const Complaint = mongoose.model("Complaint", complaintSchema);
