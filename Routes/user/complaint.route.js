import { closeComplaintByUser, deleteComplaint, getUserComplaints,getComplaintById, submitComplaint, updateComplaintByUser } from "../../controller/complaint.controller.js";
import { createRateLimiter } from "../../middlewares/rate-limiter.middleware.js";
import { upload } from "../../middlewares/multer.middleware.js";
import {jwtMiddleware } from "../../middlewares/jwt.middleware.js"
import { USER_ROLE } from "../../middlewares/roleBase.middleware.js";
import express from "express";

const complaintRouteUser = express.Router()

   complaintRouteUser.use([jwtMiddleware,USER_ROLE])
   complaintRouteUser.post("/submit", createRateLimiter(4, 1),upload.fields([
    { name: "attachments", maxCount: 4 }, // images only → Cloudinary
    { name: "pdf", maxCount: 1 }          // pdf → read only
  ]),submitComplaint)

  complaintRouteUser.get("/",createRateLimiter(12, 1),getUserComplaints)
  complaintRouteUser.get("/:id",createRateLimiter(5, 1),getComplaintById)
  complaintRouteUser.patch("/update/:id",createRateLimiter(5, 1),upload.fields([
    { name: "attachments", maxCount: 4 }, // images only → Cloudinary  
  ]),updateComplaintByUser)
  complaintRouteUser.patch("/updateStatus/:id",createRateLimiter(3, 1),closeComplaintByUser)
  complaintRouteUser.delete("/delete/:id",createRateLimiter(3, 1),deleteComplaint)

export default complaintRouteUser;