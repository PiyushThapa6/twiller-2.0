import mongoose from "mongoose";
const TweetSchema = mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String, default: "" },
  likes: { type: Number, default: 0 },
  retweets: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  retweetedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  image: { type: String, default: null },
  audioUrl: { type: String, default: null },
  audioDurationSeconds: { type: Number, default: null },
  audioFileSizeBytes: { type: Number, default: null },
  timestamp: { type: Date, default: Date.now() },
});

export default mongoose.model("Tweet", TweetSchema);
