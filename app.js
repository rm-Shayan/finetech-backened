import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression"; // <-- import compression
import { corsOptions } from "./contants.js";
import cookieParser from "cookie-parser";

import authRouteUser from "./Routes/user/auth.route.js";
import complaintRouteUser from "./Routes/user/complaint.route.js";

import { ApiResponse } from "./utiLs/ApiResponse.js";
import { ApiError } from "./utiLs/ApiError.js";

import authRouteBankOfficer from "./Routes/bankOfficer/auth.route.js";
import complaintRouteBankOfficer from "./Routes/bankOfficer/complaint.route.js";

import authRouteSBP from "./Routes/sbp_admin/auth.route.js";
import complaintRouteSBP from "./Routes/sbp_admin/complaint.route.js";

//remark routes of user and bank officer
import remarkUser from "./Routes/user/remarks.route.js";
import remarkBank_Officer from "./Routes/bankOfficer/remarks.route.js";


//public route
import  bankRoute from "./Routes/bank.route.js"

export const app = express();

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true}));

// Security headers
app.use(helmet());

// Enable CORS
app.use(cors(corsOptions));

// Enable compression for all responses
app.use(compression());

// for handling cookies in request 
app.use(cookieParser());

//user
app.use("/api/v1/auth/user",authRouteUser)
app.use("/api/v1/user/complaint",complaintRouteUser)
app.use("/api/v1/user/remark",remarkUser)

//Bank Officer
app.use("/api/v1/auth/Bank_Officer",authRouteBankOfficer)
app.use("/api/v1/Bank_Officer/complaint",complaintRouteBankOfficer)
app.use("/api/v1/Bank_Officer/remark",remarkBank_Officer)

//admin routes
app.use("/api/v1/auth/sbp_admin",authRouteSBP)
app.use("/api/v1/sbp_admin/complaint",complaintRouteSBP)

//public
app.use("/api/v1/bank", bankRoute)

// Example route
app.get("/", (req, res) => {
  res.send("Hello World! Payload is compressed if large enough.");
});



app.use((err, req, res, next) => {
  // Log full stack in terminal
  console.error(err.stack || err);

  // If ApiError, use its status and message
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(
      new ApiResponse(err.statusCode, null, err.message)
    );
  }

  // For unknown errors
  return res.status(500).json(
    new ApiResponse(500, null, "Internal Server Error")
  );
});