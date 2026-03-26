"use client";

import { useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

const languageOptions = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "hi", label: "Hindi" },
  { value: "pt", label: "Portuguese" },
  { value: "zh", label: "Chinese" },
  { value: "fr", label: "French" },
] as const;

export default function LanguageSelector() {
  const { user, refreshUser } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [targetLanguage, setTargetLanguage] = useState(language);
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!user) return null;

  const requestOtp = async () => {
    try {
      setIsLoading(true);
      setError("");
      const res = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/language-otp/request`, {
        userId: user._id,
        targetLanguage,
      });
      setChallengeId(res.data.challengeId);
      setStatus(res.data.message);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || "OTP request failed.");
      } else {
        setError("OTP request failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async () => {
    try {
      setIsLoading(true);
      setError("");
      const res = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/language-otp/verify`, {
        challengeId,
        otp,
      });
      setLanguage(targetLanguage as typeof language);
      setStatus(res.data.message);
      await refreshUser(user.email);
      setOtp("");
      setChallengeId("");
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || "OTP verification failed.");
      } else {
        setError("OTP verification failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-gray-800 bg-black text-white">
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="text-lg font-bold">Language</h3>
          <p className="text-sm text-gray-400">
            French requires email OTP. Other languages require mobile OTP.
          </p>
        </div>
        <select
          value={targetLanguage}
          onChange={(event) => setTargetLanguage(event.target.value)}
          className="w-full rounded-xl border border-gray-700 bg-black px-4 py-3 text-white"
        >
          {languageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={requestOtp}
            disabled={isLoading || targetLanguage === user.preferredLanguage}
            className="rounded-full bg-blue-500 text-white hover:bg-blue-600"
          >
            Send OTP
          </Button>
          <input
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
            placeholder="Enter OTP"
            className="flex-1 rounded-full border border-gray-700 bg-transparent px-4 py-2 text-white"
          />
          <Button
            type="button"
            onClick={verifyOtp}
            disabled={isLoading || !challengeId || !otp.trim()}
            className="rounded-full bg-white text-black hover:bg-gray-200"
          >
            Verify
          </Button>
        </div>
        {status && <p className="text-sm text-green-400">{status}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}
