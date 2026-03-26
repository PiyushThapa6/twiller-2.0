import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
import nodemailer from "nodemailer";
import User from "./models/user.js";
import Tweet from "./models/tweet.js";
dotenv.config();
const app = express();
const MAX_AUDIO_DURATION_SECONDS = 5 * 60;
const MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024;
const IST_AUDIO_START_MINUTES = 14 * 60;
const IST_AUDIO_END_MINUTES = 19 * 60;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const AUDIO_VERIFICATION_EXPIRY_MS = 15 * 60 * 1000;
const pendingOtpStore = new Map();
const verifiedAudioOtpStore = new Map();

const mailTransport =
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    : null;

const generateOtpCode = () =>
  crypto.randomInt(100000, 1000000).toString();

const generateVerificationToken = () => crypto.randomUUID();

const getCurrentIstMinutes = () => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value || 0
  );

  return hour * 60 + minute;
};

const isWithinAudioWindow = () => {
  const currentIstMinutes = getCurrentIstMinutes();
  return (
    currentIstMinutes >= IST_AUDIO_START_MINUTES &&
    currentIstMinutes <= IST_AUDIO_END_MINUTES
  );
};

const consumeAudioVerificationToken = (email, token) => {
  const verifiedOtp = verifiedAudioOtpStore.get(token);
  if (!verifiedOtp) return false;
  if (verifiedOtp.email !== email) return false;
  if (verifiedOtp.expiresAt < Date.now()) {
    verifiedAudioOtpStore.delete(token);
    return false;
  }

  verifiedAudioOtpStore.delete(token);
  return true;
};

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));
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
    const user = await User.findOne({ email: email });
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
app.post("/audio-otp/request", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({ error: "Email is required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send({ error: "User not found." });
    }

    if (!mailTransport || !process.env.SMTP_FROM_EMAIL) {
      return res.status(500).send({
        error:
          "OTP email service is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL to the backend environment.",
      });
    }

    const otp = generateOtpCode();
    pendingOtpStore.set(email, {
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    await mailTransport.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
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

    const pendingOtp = pendingOtpStore.get(email);
    if (!pendingOtp) {
      return res.status(400).send({ error: "No OTP request found." });
    }
    if (pendingOtp.expiresAt < Date.now()) {
      pendingOtpStore.delete(email);
      return res.status(400).send({ error: "OTP has expired." });
    }
    if (pendingOtp.otp !== otp) {
      return res.status(400).send({ error: "Invalid OTP." });
    }

    pendingOtpStore.delete(email);
    const verificationToken = generateVerificationToken();
    verifiedAudioOtpStore.set(verificationToken, {
      email,
      expiresAt: Date.now() + AUDIO_VERIFICATION_EXPIRY_MS,
    });

    return res.status(200).send({
      message: "OTP verified successfully.",
      verificationToken,
    });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});
app.post("/post", async (req, res) => {
  try {
    const hasAudio = Boolean(req.body.audioUrl);
    const trimmedContent = typeof req.body.content === "string"
      ? req.body.content.trim()
      : "";

    if (!trimmedContent && !hasAudio) {
      return res.status(400).send({
        error: "A tweet must contain text or audio.",
      });
    }

    if (hasAudio) {
      const author = await User.findById(req.body.author);
      if (!author) {
        return res.status(404).send({ error: "Author not found." });
      }

      if (!isWithinAudioWindow()) {
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

      const isVerified = consumeAudioVerificationToken(
        author.email,
        req.body.audioOtpToken
      );
      if (!isVerified) {
        return res.status(401).send({
          error: "Audio tweet OTP verification is required.",
        });
      }
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
