import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
import nodemailer from "nodemailer";
import Razorpay from "razorpay";
import twilio from "twilio";
import { UAParser } from "ua-parser-js";
import { initializeApp as initializeAdminApp, cert, getApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import User from "./models/user.js";
import Tweet from "./models/tweet.js";

dotenv.config();

const app = express();

const MAX_AUDIO_DURATION_SECONDS = 5 * 60;
const MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const AUDIO_VERIFICATION_EXPIRY_MS = 15 * 60 * 1000;
const LOGIN_OTP_EXPIRY_MS = 10 * 60 * 1000;
const LANGUAGE_OTP_EXPIRY_MS = 10 * 60 * 1000;
const PASSWORD_RESET_ONCE_PER_DAY_MESSAGE =
  "You can use this option only one time per day.";

const IST_WINDOWS = {
  audio: { startMinutes: 14 * 60, endMinutes: 19 * 60 },
  payment: { startMinutes: 10 * 60, endMinutes: 11 * 60 },
  mobileLogin: { startMinutes: 10 * 60, endMinutes: 13 * 60 },
};

const PLAN_DETAILS = {
  FREE: { amount: 0, maxTweets: 1, label: "Free Plan" },
  BRONZE: { amount: 100, maxTweets: 3, label: "Bronze Plan" },
  SILVER: { amount: 300, maxTweets: 5, label: "Silver Plan" },
  GOLD: { amount: 1000, maxTweets: Infinity, label: "Gold Plan" },
};

const AUDIO_OTP_STORE = new Map();
const LANGUAGE_OTP_STORE = new Map();
const LOGIN_CHALLENGE_STORE = new Map();
const PAYMENT_ORDER_STORE = new Map();

const createMailTransport = () => {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_PORT ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const mailTransport = createMailTransport();

const smsClient =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PHONE_NUMBER
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const razorpayClient =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

const firebaseAdminConfigAvailable =
  process.env.FIREBASE_ADMIN_PROJECT_ID &&
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
  process.env.FIREBASE_ADMIN_PRIVATE_KEY;

let firebaseAdminAuth = null;
if (firebaseAdminConfigAvailable) {
  const adminApp =
    getApps()[0] ||
    initializeAdminApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  firebaseAdminAuth = getAdminAuth(adminApp);
}

const getRequestIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "unknown";
};

const getIstParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type) =>
    parts.find((part) => part.type === type)?.value || "00";

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: Number(getPart("hour")),
    minute: Number(getPart("minute")),
  };
};

const getIstMinutes = (date = new Date()) => {
  const { hour, minute } = getIstParts(date);
  return hour * 60 + minute;
};

const isWithinIstWindow = (windowConfig) => {
  const currentMinutes = getIstMinutes();
  return (
    currentMinutes >= windowConfig.startMinutes &&
    currentMinutes <= windowConfig.endMinutes
  );
};

const getIstDateKey = (date = new Date()) => {
  const { year, month, day } = getIstParts(date);
  return `${year}-${month}-${day}`;
};

const isSameIstDay = (dateA, dateB = new Date()) => {
  if (!dateA) return false;
  return getIstDateKey(new Date(dateA)) === getIstDateKey(dateB);
};

const generateOtpCode = () => crypto.randomInt(100000, 1000000).toString();
const generateSessionToken = () => crypto.randomUUID();

const generateAlphabeticPassword = (length = 12) => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let password = "";

  for (let index = 0; index < length; index += 1) {
    password += characters[crypto.randomInt(0, characters.length)];
  }

  return password;
};

const ensureMailConfigured = (res) => {
  if (!mailTransport || !process.env.SMTP_FROM_EMAIL) {
    res.status(500).send({
      error:
        "Email service is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL.",
    });
    return false;
  }

  return true;
};

const ensureSmsConfigured = (res) => {
  if (!smsClient || !process.env.TWILIO_PHONE_NUMBER) {
    res.status(500).send({
      error:
        "SMS service is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.",
    });
    return false;
  }

  return true;
};

const ensureFirebaseAdminConfigured = (res) => {
  if (!firebaseAdminAuth) {
    res.status(500).send({
      error:
        "Firebase Admin is not configured. Add FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.",
    });
    return false;
  }

  return true;
};

const ensureRazorpayConfigured = (res) => {
  if (!razorpayClient || !process.env.RAZORPAY_KEY_SECRET) {
    res.status(500).send({
      error:
        "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    });
    return false;
  }

  return true;
};

const sendEmail = async ({ to, subject, text, html }) => {
  await mailTransport.sendMail({
    from: process.env.SMTP_FROM_EMAIL,
    to,
    subject,
    text,
    html,
  });
};

const sendSms = async ({ to, body }) => {
  await smsClient.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
    body,
  });
};

const getPlanForUser = (user) => {
  if (!user.subscriptionPlan || user.subscriptionPlan === "FREE") {
    return "FREE";
  }

  if (!user.subscriptionValidUntil) {
    return user.subscriptionPlan;
  }

  if (new Date(user.subscriptionValidUntil).getTime() < Date.now()) {
    return "FREE";
  }

  return user.subscriptionPlan;
};

const getDeviceCategory = (deviceType) => {
  if (deviceType === "mobile" || deviceType === "tablet") {
    return "mobile";
  }

  return "desktop";
};

const getLoginMetadata = (req, userAgentString) => {
  const parser = new UAParser(userAgentString || req.headers["user-agent"] || "");
  const browserName = parser.getBrowser().name || "Unknown";
  const operatingSystem = parser.getOS().name || "Unknown";
  const deviceType = parser.getDevice().type;

  return {
    browser: browserName,
    operatingSystem,
    deviceCategory: getDeviceCategory(deviceType),
    ipAddress: getRequestIp(req),
  };
};

const isChromeBrowser = (browserName) =>
  browserName.toLowerCase().includes("chrome") &&
  !browserName.toLowerCase().includes("edge");

const isMicrosoftBrowser = (browserName) => {
  const normalized = browserName.toLowerCase();
  return normalized.includes("edge") || normalized.includes("ie");
};

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Twiller backend is running successfully");
});

const port = process.env.PORT || 5000;
const url = process.env.MONOGDB_URL;

mongoose
  .connect(url)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });

app.post("/register", async (req, res) => {
  try {
    const existinguser = await User.findOne({ email: req.body.email });
    if (existinguser) {
      return res.status(200).send(existinguser);
    }
    const newUser = new User(req.body);
    await newUser.save();
    return res.status(201).send(newUser);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.get("/loggedinuser", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).send({ error: "Email required" });
    }
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "User not found" });
    return res.status(200).send(user);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.patch("/userupdate/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const updated = await User.findOneAndUpdate(
      { email },
      { $set: req.body },
      { new: true, upsert: false }
    );
    return res.status(200).send(updated);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/forgot-password/request", async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).send({ error: "Email or phone is required." });
    }

    if (!ensureMailConfigured(res) || !ensureFirebaseAdminConfigured(res)) {
      return;
    }

    const normalizedIdentifier = String(identifier).trim();
    const user = await User.findOne({
      $or: [{ email: normalizedIdentifier }, { phone: normalizedIdentifier }],
    });

    if (!user) {
      return res.status(404).send({ error: "User not found." });
    }

    if (user.lastPasswordResetAt && isSameIstDay(user.lastPasswordResetAt)) {
      return res.status(429).send({
        error: PASSWORD_RESET_ONCE_PER_DAY_MESSAGE,
      });
    }

    const newPassword = generateAlphabeticPassword();
    const firebaseUser = await firebaseAdminAuth.getUserByEmail(user.email);
    await firebaseAdminAuth.updateUser(firebaseUser.uid, {
      password: newPassword,
    });

    await sendEmail({
      to: user.email,
      subject: "Your Twiller password has been reset",
      text: `Your new password is ${newPassword}. Please sign in and change it immediately.`,
    });

    user.lastPasswordResetAt = new Date();
    await user.save();

    return res.status(200).send({
      message: "A new generated password has been sent to your email.",
    });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/audio-otp/request", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({ error: "Email is required." });
    }
    if (!ensureMailConfigured(res)) {
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send({ error: "User not found." });
    }

    const otp = generateOtpCode();
    AUDIO_OTP_STORE.set(email, {
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    await sendEmail({
      to: email,
      subject: "Your Twiller audio tweet OTP",
      text: `Your Twiller OTP is ${otp}. It expires in 10 minutes.`,
    });

    return res.status(200).send({ message: "OTP sent successfully." });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/audio-otp/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).send({ error: "Email and OTP are required." });
    }

    const pendingOtp = AUDIO_OTP_STORE.get(email);
    if (!pendingOtp) {
      return res.status(400).send({ error: "No OTP request found." });
    }
    if (pendingOtp.expiresAt < Date.now()) {
      AUDIO_OTP_STORE.delete(email);
      return res.status(400).send({ error: "OTP has expired." });
    }
    if (pendingOtp.otp !== otp) {
      return res.status(400).send({ error: "Invalid OTP." });
    }

    AUDIO_OTP_STORE.delete(email);
    const verificationToken = generateSessionToken();
    AUDIO_OTP_STORE.set(verificationToken, {
      email,
      expiresAt: Date.now() + AUDIO_VERIFICATION_EXPIRY_MS,
      verified: true,
    });

    return res.status(200).send({
      message: "OTP verified successfully.",
      verificationToken,
    });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/login-access/request", async (req, res) => {
  try {
    const { email, userAgent } = req.body;
    if (!email) {
      return res.status(400).send({ error: "Email is required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send({ error: "User not found." });
    }

    const metadata = getLoginMetadata(req, userAgent);
    if (
      metadata.deviceCategory === "mobile" &&
      !isWithinIstWindow(IST_WINDOWS.mobileLogin)
    ) {
      return res.status(403).send({
        error: "Mobile logins are allowed only between 10:00 AM and 1:00 PM IST.",
      });
    }

    const challengeId = generateSessionToken();
    const requiresOtp = isChromeBrowser(metadata.browser);
    const bypassOtp = isMicrosoftBrowser(metadata.browser) || !requiresOtp;

    const challengeRecord = {
      email,
      verified: bypassOtp,
      metadata,
      expiresAt: Date.now() + LOGIN_OTP_EXPIRY_MS,
    };

    if (requiresOtp) {
      if (!ensureMailConfigured(res)) {
        return;
      }

      const otp = generateOtpCode();
      challengeRecord.otp = otp;
      await sendEmail({
        to: email,
        subject: "Your Twiller login OTP",
        text: `Your login OTP is ${otp}. It expires in 10 minutes.`,
      });
    }

    LOGIN_CHALLENGE_STORE.set(challengeId, challengeRecord);

    return res.status(200).send({
      challengeId,
      requiresOtp,
      browser: metadata.browser,
      deviceCategory: metadata.deviceCategory,
    });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/login-access/verify", async (req, res) => {
  try {
    const { challengeId, otp } = req.body;
    const challenge = LOGIN_CHALLENGE_STORE.get(challengeId);

    if (!challenge) {
      return res.status(400).send({ error: "Login challenge not found." });
    }
    if (challenge.expiresAt < Date.now()) {
      LOGIN_CHALLENGE_STORE.delete(challengeId);
      return res.status(400).send({ error: "Login OTP has expired." });
    }
    if (challenge.otp !== otp) {
      return res.status(400).send({ error: "Invalid OTP." });
    }

    challenge.verified = true;
    LOGIN_CHALLENGE_STORE.set(challengeId, challenge);

    return res.status(200).send({ message: "Login OTP verified." });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/login-history/record", async (req, res) => {
  try {
    const { email, challengeId } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send({ error: "User not found." });
    }

    const challenge = LOGIN_CHALLENGE_STORE.get(challengeId);
    if (!challenge || challenge.email !== email) {
      return res.status(400).send({ error: "Invalid login challenge." });
    }
    if (!challenge.verified) {
      return res.status(401).send({ error: "Login OTP verification is required." });
    }

    user.loginHistory.unshift({
      browser: challenge.metadata.browser,
      operatingSystem: challenge.metadata.operatingSystem,
      deviceCategory: challenge.metadata.deviceCategory,
      ipAddress: challenge.metadata.ipAddress,
      loggedInAt: new Date(),
    });
    user.loginHistory = user.loginHistory.slice(0, 10);
    await user.save();

    LOGIN_CHALLENGE_STORE.delete(challengeId);

    return res.status(200).send({ message: "Login history recorded." });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/language-otp/request", async (req, res) => {
  try {
    const { userId, targetLanguage } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ error: "User not found." });
    }

    const challengeId = generateSessionToken();
    const otp = generateOtpCode();
    const useEmail = targetLanguage === "fr";

    if (useEmail) {
      if (!ensureMailConfigured(res)) {
        return;
      }

      await sendEmail({
        to: user.email,
        subject: "Your Twiller language verification OTP",
        text: `Your OTP for changing the language to French is ${otp}.`,
      });
    } else {
      if (!user.phone) {
        return res.status(400).send({
          error: "Add a phone number to your profile before changing language.",
        });
      }
      if (!ensureSmsConfigured(res)) {
        return;
      }

      await sendSms({
        to: user.phone,
        body: `Your Twiller OTP for language change is ${otp}.`,
      });
    }

    LANGUAGE_OTP_STORE.set(challengeId, {
      userId,
      targetLanguage,
      otp,
      expiresAt: Date.now() + LANGUAGE_OTP_EXPIRY_MS,
    });

    return res.status(200).send({
      message: useEmail
        ? "OTP sent to your email."
        : "OTP sent to your mobile number.",
      challengeId,
    });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/language-otp/verify", async (req, res) => {
  try {
    const { challengeId, otp } = req.body;
    const challenge = LANGUAGE_OTP_STORE.get(challengeId);

    if (!challenge) {
      return res.status(400).send({ error: "Language change request not found." });
    }
    if (challenge.expiresAt < Date.now()) {
      LANGUAGE_OTP_STORE.delete(challengeId);
      return res.status(400).send({ error: "Language OTP has expired." });
    }
    if (challenge.otp !== otp) {
      return res.status(400).send({ error: "Invalid OTP." });
    }

    const updatedUser = await User.findByIdAndUpdate(
      challenge.userId,
      { $set: { preferredLanguage: challenge.targetLanguage } },
      { new: true }
    );

    LANGUAGE_OTP_STORE.delete(challengeId);

    return res.status(200).send({
      message: "Language updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/payment/order", async (req, res) => {
  try {
    const { userId, plan } = req.body;
    if (!ensureRazorpayConfigured(res)) {
      return;
    }
    if (!isWithinIstWindow(IST_WINDOWS.payment)) {
      return res.status(400).send({
        error: "Payments are allowed only between 10:00 AM and 11:00 AM IST.",
      });
    }

    const selectedPlan = PLAN_DETAILS[plan];
    if (!selectedPlan || plan === "FREE") {
      return res.status(400).send({ error: "Invalid subscription plan." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ error: "User not found." });
    }

    const order = await razorpayClient.orders.create({
      amount: selectedPlan.amount * 100,
      currency: "INR",
      receipt: `receipt_${user._id}_${Date.now()}`,
    });

    PAYMENT_ORDER_STORE.set(order.id, {
      userId,
      plan,
      amount: selectedPlan.amount,
    });

    return res.status(200).send({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan,
      keyId: process.env.RAZORPAY_KEY_ID,
      user: {
        name: user.displayName,
        email: user.email,
        contact: user.phone,
      },
    });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/payment/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!ensureRazorpayConfigured(res) || !ensureMailConfigured(res)) {
      return;
    }

    const paymentRecord = PAYMENT_ORDER_STORE.get(razorpay_order_id);
    if (!paymentRecord) {
      return res.status(400).send({ error: "Payment order not found." });
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).send({ error: "Invalid payment signature." });
    }

    const subscriptionValidUntil = new Date();
    subscriptionValidUntil.setMonth(subscriptionValidUntil.getMonth() + 1);

    const updatedUser = await User.findByIdAndUpdate(
      paymentRecord.userId,
      {
        $set: {
          subscriptionPlan: paymentRecord.plan,
          subscriptionPurchasedAt: new Date(),
          subscriptionValidUntil,
        },
      },
      { new: true }
    );

    await sendEmail({
      to: updatedUser.email,
      subject: `Twiller invoice for ${PLAN_DETAILS[paymentRecord.plan].label}`,
      text: `Plan: ${PLAN_DETAILS[paymentRecord.plan].label}\nAmount: INR ${paymentRecord.amount}\nPayment ID: ${razorpay_payment_id}\nValid Until: ${subscriptionValidUntil.toISOString()}`,
      html: `<div>
        <h2>Twiller Subscription Invoice</h2>
        <p><strong>Plan:</strong> ${PLAN_DETAILS[paymentRecord.plan].label}</p>
        <p><strong>Amount:</strong> INR ${paymentRecord.amount}</p>
        <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
        <p><strong>Valid Until:</strong> ${subscriptionValidUntil.toDateString()}</p>
      </div>`,
    });

    PAYMENT_ORDER_STORE.delete(razorpay_order_id);

    return res.status(200).send({
      message: "Payment verified successfully.",
      user: updatedUser,
    });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/post", async (req, res) => {
  try {
    const hasAudio = Boolean(req.body.audioUrl);
    const trimmedContent =
      typeof req.body.content === "string" ? req.body.content.trim() : "";

    if (!trimmedContent && !hasAudio) {
      return res.status(400).send({
        error: "A tweet must contain text or audio.",
      });
    }

    const author = await User.findById(req.body.author);
    if (!author) {
      return res.status(404).send({ error: "Author not found." });
    }

    const effectivePlan = getPlanForUser(author);
    const maxTweets = PLAN_DETAILS[effectivePlan].maxTweets;
    if (Number.isFinite(maxTweets)) {
      const currentTweetCount = await Tweet.countDocuments({ author: author._id });
      if (currentTweetCount >= maxTweets) {
        return res.status(403).send({
          error: `Your ${PLAN_DETAILS[effectivePlan].label} allows up to ${maxTweets} tweet(s). Upgrade your plan to post more.`,
        });
      }
    }

    if (hasAudio) {
      if (!isWithinIstWindow(IST_WINDOWS.audio)) {
        return res.status(400).send({
          error:
            "Audio tweets can only be posted between 2:00 PM and 7:00 PM IST.",
        });
      }

      const duration = Number(req.body.audioDurationSeconds);
      const fileSize = Number(req.body.audioFileSizeBytes);

      if (!Number.isFinite(duration) || duration <= 0) {
        return res.status(400).send({ error: "Invalid audio duration." });
      }
      if (duration > MAX_AUDIO_DURATION_SECONDS) {
        return res.status(400).send({
          error: "Audio tweets must be 5 minutes or less.",
        });
      }
      if (!Number.isFinite(fileSize) || fileSize <= 0) {
        return res.status(400).send({ error: "Invalid audio file size." });
      }
      if (fileSize > MAX_AUDIO_SIZE_BYTES) {
        return res.status(400).send({
          error: "Audio tweets must be 100 MB or less.",
        });
      }

      const verificationRecord = AUDIO_OTP_STORE.get(req.body.audioOtpToken);
      if (
        !verificationRecord ||
        !verificationRecord.verified ||
        verificationRecord.email !== author.email ||
        verificationRecord.expiresAt < Date.now()
      ) {
        return res.status(401).send({
          error: "Audio tweet OTP verification is required.",
        });
      }

      AUDIO_OTP_STORE.delete(req.body.audioOtpToken);
    }

    const tweet = new Tweet({
      ...req.body,
      content: trimmedContent,
    });
    await tweet.save();
    const populatedTweet = await Tweet.findById(tweet._id).populate("author");
    return res.status(201).send(populatedTweet);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.get("/post", async (req, res) => {
  try {
    const tweet = await Tweet.find().sort({ timestamp: -1 }).populate("author");
    return res.status(200).send(tweet);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/like/:tweetid", async (req, res) => {
  try {
    const { userId } = req.body;
    const tweet = await Tweet.findById(req.params.tweetid);
    if (!tweet.likedBy.includes(userId)) {
      tweet.likes += 1;
      tweet.likedBy.push(userId);
      await tweet.save();
    }
    res.send(tweet);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

app.post("/retweet/:tweetid", async (req, res) => {
  try {
    const { userId } = req.body;
    const tweet = await Tweet.findById(req.params.tweetid);
    if (!tweet.retweetedBy.includes(userId)) {
      tweet.retweets += 1;
      tweet.retweetedBy.push(userId);
      await tweet.save();
    }
    res.send(tweet);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});
