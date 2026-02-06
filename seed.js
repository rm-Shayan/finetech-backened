import {Bank} from "./models/bank.model.js"
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

/* ---------------- Bank Seed Data ---------------- */

const banksData = [
  { bankName: "State Bank of Pakistan", bankCode: "SBP" },
  { bankName: "National Bank of Pakistan", bankCode: "NBP" },
  { bankName: "Habib Bank Limited", bankCode: "HBL" },
  { bankName: "United Bank Limited", bankCode: "UBL" },
  { bankName: "Muslim Commercial Bank", bankCode: "MCB" },
  { bankName: "Allied Bank Limited", bankCode: "ABL" },
  { bankName: "Bank Alfalah", bankCode: "BAFL" },
  { bankName: "Askari Bank", bankCode: "ASK" },
  { bankName: "Faysal Bank", bankCode: "FBL" },
  { bankName: "JS Bank", bankCode: "JSBL" },
  { bankName: "Meezan Bank", bankCode: "MEEZAN" },
  { bankName: "Bank of Punjab", bankCode: "BOP" },
  { bankName: "Standard Chartered Bank", bankCode: "SCB" },
];

/* ---------------- Seed Function ---------------- */

const seedBanks = async () => {
  try {
    await mongoose.connect(`${process.env.MONGO_URI}`);

    console.log("✅ MongoDB connected");

    // Optional: clear old data
    await Bank.deleteMany({});
    console.log("🗑 Existing banks removed");

    await Bank.insertMany(banksData);
    console.log("🏦 Banks seeded successfully");

    process.exit(0);
  } catch (error) {
    console.error("❌ Bank seeding failed:", error);
    process.exit(1);
  }
};

seedBanks();
