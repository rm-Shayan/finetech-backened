import nodemailer from "nodemailer";
import { ApiError } from "../utiLs/ApiError.js";

export const sendMail = async ({ to, subject, message }) => {
  try {
    // 1️⃣ Transporter
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      secure: false, // true only for port 465
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    // 2️⃣ Mail options
    const mailOptions = {
      from: `"Finetech Support" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html: message,
    };

    // 3️⃣ Send mail
    await transporter.sendMail(mailOptions);

    return true;
  } catch (error) {
    console.error("Email send error:", error);
    throw new ApiError(500, "Unable to send email");
  }
};
