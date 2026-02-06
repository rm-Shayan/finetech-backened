import { ApiError } from "../utiLs/ApiError.js";
import { ApiResponse } from "../utiLs/ApiResponse.js";
import { asyncHandler } from "../utiLs/asyncHandler.js";
import { Bank } from "../models/bank.model.js";
import redisClient from "../config/redis.js";

export const getBanks = asyncHandler(async (req, res) => {
  const CACHE_KEY = "banks:list";

  // 1️⃣ Check cache
  const cachedBanks = await redisClient.get(CACHE_KEY);

  if (cachedBanks) {
    return res.status(200).json(
      new ApiResponse(200, JSON.parse(cachedBanks), "Banks fetched from cache")
    );
  }

  // 2️⃣ Fetch from DB
  const banks = await Bank.find().select("bankName bankCode");

  if (!banks || banks.length === 0) {
    throw new ApiError(404, "No banks found");
  }

  // 3️⃣ Save to cache (optional expiry)
  await redisClient.set(
    CACHE_KEY,
    JSON.stringify(banks),
    { EX: 60 * 10 } // cache for 10 minutes
  );

  // 4️⃣ Send response
  return res.status(200).json(
    new ApiResponse(200, banks, "Banks fetched successfully")
  );
});
