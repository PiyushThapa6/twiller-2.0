import mongoose from "mongoose";
const UserSchema = mongoose.Schema({
  username: { type: String, required: true },
  displayName: { type: String, required: true },
  avatar: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, default: "" },
  bio: { type: String, default: "" },
  location: { type: String, default: "" },
  website: { type: String, default: "" },
  notificationsEnabled: { type: Boolean, default: false },
  preferredLanguage: { type: String, default: "en" },
  subscriptionPlan: {
    type: String,
    enum: ["FREE", "BRONZE", "SILVER", "GOLD"],
    default: "FREE",
  },
  subscriptionPurchasedAt: { type: Date, default: null },
  subscriptionValidUntil: { type: Date, default: null },
  lastPasswordResetAt: { type: Date, default: null },
  loginHistory: [
    {
      browser: { type: String, default: "" },
      operatingSystem: { type: String, default: "" },
      deviceCategory: { type: String, default: "" },
      ipAddress: { type: String, default: "" },
      loggedInAt: { type: Date, default: Date.now },
    },
  ],
  joinedDate: { type: Date, default: Date.now() },
});

export default mongoose.model("User", UserSchema);
