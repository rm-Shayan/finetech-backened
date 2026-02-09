import { ApiError } from "../utiLs/ApiError.js";
import { ApiResponse } from "../utiLs/ApiResponse.js";
import { asyncHandler } from "../utiLs/asyncHandler.js";
import { User } from "../models/user.model.js";
import { sendMail } from "../services/email.js";
import { generateTokens } from "../utiLs/generateTokens.js";
import redisClient from "../config/redis.js";
import { jwtVerify } from "../utiLs/jwt-verify.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../services/cloudinary.js";
import { sanitizeUser } from "../utiLs/sanitizeUser.js";
import { Bank } from "../models/bank.model.js";
import crypto from "crypto";

export const signupUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, bankId } = req.body;

  // 1️⃣ Validate required fields
  if (!name || !email || !password) {
    throw new ApiError(400, "Name, email and password are required");
  }

  // 2️⃣ Check existing user
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "User already exists with this email");
  }

  // 3️⃣ Create user
  const user = await User.create({
    name,
    email,
    password,
    role: role || "customer",
    bankId: bankId || null,
  });

  // 4️⃣ Prepare login URL based on role
  const loginUrl =
    role === "bank_officer"
      ? `${process.env.FRONTEND_URL}/login?role=bank_officer`
      : `${process.env.FRONTEND_URL}/login?role=user`;

  // 5️⃣ Send welcome email with login link
  sendMail({
    to: email,
    subject: "Welcome to Finetech 🎉",
    message: `
      <h2>Welcome, ${name}!</h2>
      <p>Your account has been created successfully.</p>
      <p>You can login using this link:</p>
      <a href="${loginUrl}" target="_blank">${loginUrl}</a>
      <br/>
      <strong>Finetech Team</strong>
    `,
  }).catch((err) => {
    console.error("Welcome email failed:", err.message);
  });

  // 6️⃣ Remove sensitive fields
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken",
  );

  // 7️⃣ Send response
  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new ApiError(401, "Invalid email or password");

  const isPasswordValid = await user.comparePassword(password, user.password);
  if (!isPasswordValid) throw new ApiError(401, "Invalid email or password");

  // Generate tokens
  const { accessToken, refreshToken } = await generateTokens(user);

  // Set refresh token in HTTP-only cookie
 res.cookie("refreshToken", refreshToken, {
  httpOnly: true,
  secure: true,       // hamesha true
  sameSite: "None",   // hamesha None
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

res.cookie("accessToken", accessToken, {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  maxAge: 15 * 60 * 1000,
});


  const safeUser = user.toObject();
  delete safeUser.password;
  delete safeUser.refreshToken;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        user: safeUser,
        accessToken, // Send access token in body
      },
      "Login successful",
    ),
  );
});

export const getUser = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized request");
  }

  const cacheKey = `user:${req.user._id}`;

  // 1️⃣ Check Redis
  const cachedUser = await redisClient.get(cacheKey);

  if (cachedUser) {
    return res
      .status(200)
      .json(
        new ApiResponse(200, JSON.parse(cachedUser), "User fetched from cache"),
      );
  }

  // 2️⃣ Fetch from DB
  const user = await User.findById(req.user._id).select(
    "-password -refreshToken",
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // 3️⃣ Sanitize & Cache
  const safeUser = user.toObject();

  await redisClient.set(
    cacheKey,
    JSON.stringify(safeUser),
    { EX: 60 * 5 }, // 5 minutes cache
  );

  // 4️⃣ Send response
  return res
    .status(200)
    .json(new ApiResponse(200, safeUser, "User fetched successfully"));
});

export const deleteAccount = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized request");
  }

  // 1️⃣ Soft delete user
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      isDeleted: true,
      deletedAt: new Date(),
    },
    { new: true },
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user?.avatar?.public_id) {
    try {
      await deleteFromCloudinary(user.avatar.public_id);
    } catch (err) {
      console.error("Cloudinary avatar delete failed:", err.message);
    }
  }

  // 2️⃣ Remove user from Redis cache
  await redisClient.del(`user:${req.user.id}`);

  // 3️⃣ Clear cookies
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Account scheduled for deletion"));
});

export const updateUser = asyncHandler(async (req, res) => {
  if (!req.user?._id) throw new ApiError(401, "Unauthorized request");

  const { name, email } = req.body;
  const file = req.file; // multer file object

  if (!name && !email && !file)
    throw new ApiError(400, "Provide at least one field or file to update");

  const updateData = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email;

  // Handle avatar upload
  if (file) {
    // 1️⃣ Remove old avatar from Cloudinary
    const oldUser = await User.findById(req.user._id);
    if (oldUser?.avatar?.public_id) {
      try {
        await deleteFromCloudinary(oldUser.avatar.public_id);
      } catch (err) {
        console.error("Old avatar deletion failed:", err.message);
      }
    }

    // 2️⃣ Upload new avatar
    const result = await uploadToCloudinary(file.path, "avatars");
    updateData.avatar = { url: result.secure_url, public_id: result.public_id };
  }

  // 3️⃣ Update DB
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateData },
    { new: true },
  ).select("-password -refreshToken");

  // 4️⃣ Update Redis cache
  const cacheKey = `user:${req.user._id}`;
  await redisClient.set(cacheKey, JSON.stringify(updatedUser), { EX: 60 * 5 }); // 5 min cache

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "User updated successfully"));
});

export const logoutUser = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized request");
  }

  // 1️⃣ Remove cached user
  await redisClient.del(`user:${req.user._id}`);

  // 2️⃣ Clear cookies
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "None",
  });

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "None",
  });

  return res.status(200).json(new ApiResponse(200, null, "Logout successful"));
});

export const refreshTokens = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    throw new ApiError(401, "Refresh token missing");
  }

  let decode;
  try {
    decode = await jwtVerify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decode._id);
  if (!user || user.isDeleted) {
    throw new ApiError(403, "User not found or deleted");
  }

  const { accessToken, refreshToken: newRefreshToken } =
    await generateTokens(user);

  res.cookie("refreshToken", refreshToken, {
  httpOnly: true,
  secure: true,       // hamesha true
  sameSite: "None",   // hamesha None
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

res.cookie("accessToken", accessToken, {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  maxAge: 15 * 60 * 1000,
});

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Tokens refreshed successfully"));
});

export const changePassword = asyncHandler(async (req, res) => {
  const userId = req?.user?._id;
  if (!userId) throw new ApiError(401, "Unauthorized request");

  const { currentPassword, newPassword } = req.body;

  // 1️⃣ Validate input
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Current and new password are required");
  }

  // 2️⃣ Fetch user with password
  const user = await User.findById(userId).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  // 3️⃣ Compare current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new ApiError(401, "Current password is incorrect");

  // 4️⃣ Update password
  user.password = newPassword;
  await user.save();

  // 5️⃣ Logout: Clear cookies + Redis
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "None",
  });

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "None",
  });

  // Remove cached user from Redis
  await redisClient.del(`user:${userId}`);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Password changed successfully. Please login again.",
      ),
    );
});

export const getAllBankOfficers = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = 20;
  const skip = (page - 1) * limit;
  const { bankCode, search } = req.query; // search support

  // 🔑 Redis key: page + bankCode + search if exists
  const cacheKeyParts = [`page:${page}`];
  if (bankCode && bankCode.trim) cacheKeyParts.push(`bank:${bankCode}`);
  if (search && search.trim()) cacheKeyParts.push(`search:${search}`);
  const cacheKey = `bankOfficers:${cacheKeyParts.join(":")}`;

  // 1️⃣ Check Redis cache
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return res.status(200).json(JSON.parse(cached));
  }

  // 2️⃣ Build DB query
  const query = { role: "bank_officer", isDeleted: false };

  if (bankCode) {
    const bank = await Bank.findOne({ bankCode }).lean();
    if (!bank) throw new ApiError(404, "Bank with this code not found");
    query.bankId = bank._id;
  }

  if (search) {
    const regex = new RegExp(search.toString(), "i"); // case-insensitive search
    query.$or = [{ name: regex }, { email: regex }];
  }

  // 3️⃣ Fetch from DB
  const [users, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("bankId") // populate bank info
      .lean(),
    User.countDocuments(query),
  ]);

  const sanitizedUsers = users.map(sanitizeUser);

  // 4️⃣ Prepare result
  const result = new ApiResponse(
    200,
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      users: sanitizedUsers,
    },
    bankCode
      ? `Bank officers fetched successfully for bank code ${bankCode}`
      : search
        ? `Bank officers fetched successfully for search "${search}"`
        : "Bank officers fetched successfully",
  );

  // 5️⃣ Set Redis cache for 5 min
  await redisClient.set(cacheKey, JSON.stringify(result), { EX: 60 * 5 });

  // 6️⃣ Send response
  res.status(200).json(result);
});

export const getAllUsers = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = 20;
  const skip = (page - 1) * limit;
  const { bankCode, search } = req.query; // search param added
  const role = req?.user?.role;

  // 🔑 Redis key: page + bankCode + search if exists
  const cacheKeyParts = [`page:${page}`];

  if (bankCode) cacheKeyParts.push(`bank:${bankCode}`);
  if (search) cacheKeyParts.push(`search:${search}`);

  // ✅ role sirf tab cache me add hoga jab sbp_admin na ho
  if (req.user?.role) {
  cacheKeyParts.push(`viewer:${req.user.role}`);
}


  const cacheKey = `users:${cacheKeyParts.join(":")}`;

  // 1️⃣ Check Redis cache
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return res.status(200).json(JSON.parse(cached));
  }

  // 2️⃣ Build DB query
 const query = {
  isDeleted: false,
  role: { $ne: "sbp_admin" }, // 🔒 ALWAYS ignore admin
};

if (role && role !== "sbp_admin") {
  query.role = role; // viewer ke role ke hisaab se filter
}


  if (bankCode) {
    const bank = await Bank.findOne({ bankCode }).lean();
    if (!bank) throw new ApiError(404, "Bank with this code not found");
    query.bankId = bank._id;
  }

  if (search) {
    const regex = new RegExp(search.toString(), "i"); // case-insensitive search
    query.$or = [{ name: regex }, { email: regex }];
  }

  // 3️⃣ Fetch from DB
  const [users, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("bankId") // populate bank info
      .lean(),
    User.countDocuments(query),
  ]);

  const sanitizedUsers = users.map(sanitizeUser);

  // 4️⃣ Prepare result
  const result = new ApiResponse(
    200,
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      users: sanitizedUsers,
    },
    bankCode
      ? `Users fetched successfully for bank code ${bankCode}`
      : search
        ? `Users fetched successfully for search "${search}"`
        : "Users fetched successfully (all banks)",
  );

  // 5️⃣ Set Redis cache for 5 min
  await redisClient.set(cacheKey, JSON.stringify(result), { EX: 60 * 5 });

  // 6️⃣ Send response
  res.status(200).json(result);
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "User not found");

  // 1️⃣ Generate random token
  const resetToken = crypto.randomBytes(32).toString("hex");

  // 2️⃣ Save token in Redis (expires in 15 minutes)
  const redisKey = `passwordReset:${resetToken}`;
  await redisClient.set(redisKey, user._id.toString(), { EX: 15 * 60 }); // 15 minutes

  // 3️⃣ Create reset URL
  const resetUrl =
    user.role === "sbp_admin"
      ? `${process.env.FRONTEND_URL}/admin/reset-password?token=${resetToken}&role=${user?.role}`
      : `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&role=${user?.role}`;

  // 4️⃣ Send email
  try {
    await sendMail({
      to: user.email,
      subject: "Password Reset Request",
      message: `
        <h3>Hello ${user.name},</h3>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" target="_blank">${resetUrl}</a>
        <p>This link will expire in 15 minutes.</p>
      `,
    });
  } catch (err) {
    console.error("Forgot password email failed:", err.message);
    throw new ApiError(500, "Failed to send reset email");
  }

  res
    .status(200)
    .json(new ApiResponse(200, null, "Password reset link sent to your email"));
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    throw new ApiError(400, "Token and new password are required");

  const redisKey = `passwordReset:${token}`;

  // 1️⃣ Get userId from Redis
  const userId = await redisClient.get(redisKey);
  if (!userId) throw new ApiError(400, "Invalid or expired token");

  // 2️⃣ Update user password
  const user = await User.findById(userId).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  user.password = newPassword;
  await user.save();

  // 3️⃣ Delete token from Redis
  await redisClient.del(redisKey);

  // 4️⃣ Clear cached user + cookies
  await redisClient.del(`user:${userId}`);
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Password reset successfully. Please login again.",
      ),
    );
});

export const updatePassword = asyncHandler(async (req, res) => {
  const userId = req?.user?._id;
  if (!userId) throw new ApiError(401, "Unauthorized request");

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    throw new ApiError(400, "Current and new password are required");

  // 1️⃣ Fetch user with password
  const user = await User.findById(userId).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  // 2️⃣ Check if current password is correct
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new ApiError(401, "Current password is incorrect");

  // 3️⃣ Update password
  user.password = newPassword;
  await user.save();

  // 4️⃣ Clear old cached user
  const cacheKey = `user:${userId}`;
  await redisClient.del(cacheKey);

  // 5️⃣ Set updated user in Redis (optional, cache for 5 min)
  const updatedUser = await User.findById(userId)
    .select("-password -refreshToken")
    .lean();
  await redisClient.set(cacheKey, JSON.stringify(updatedUser), { EX: 60 * 5 }); // 5 min cache

  // 6️⃣ Clear cookies (force logout)
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedUser,
        "Password updated successfully and cache refreshed",
      ),
    );
});
