import mongoose from "mongoose";

const bankSchema = new mongoose.Schema(
  {
    bankName: {
      type: String,
      required: true,
      unique: true, // index yahin se banega
      trim: true,
      minlength: 3,
    },

    bankCode: {
      type: String,
      required: true,
      unique: true, // index yahin se banega
      uppercase: true,
      trim: true,
      minlength: 2,
      maxlength: 10,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ❌ REMOVE these lines
// bankSchema.index({ bankCode: 1 });
// bankSchema.index({ bankName: 1 });

export const Bank = mongoose.model("Bank", bankSchema);
