"use client";

import { useState } from "react";
import Link from "next/link";
import axios from "axios";
import axiosInstance from "@/lib/axiosInstance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      setIsLoading(true);
      const res = await axiosInstance.post("/forgot-password/request", {
        identifier,
      });
      setMessage(res.data.message);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.error || "Reset failed.");
      } else {
        setError("Reset failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <Card className="border-gray-800 bg-black text-white">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">
              Forgot Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-400">
                Enter your registered email address or phone number. A random
                alphabet-only password will be generated and sent to your email.
              </p>
              <Input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Email or phone number"
                className="border-gray-700 bg-transparent text-white"
              />
              {message && (
                <p className="rounded-lg border border-green-700 bg-green-950/30 p-3 text-sm text-green-300">
                  {message}
                </p>
              )}
              {error && (
                <p className="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={isLoading || !identifier.trim()}
                className="w-full rounded-full bg-blue-500 text-white hover:bg-blue-600"
              >
                {isLoading ? "Resetting..." : "Generate New Password"}
              </Button>
            </form>

            <Link
              href="/"
              className="mt-4 inline-block text-sm text-blue-400 hover:underline"
            >
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
