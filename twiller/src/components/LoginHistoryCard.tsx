"use client";

import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "./ui/card";

export default function LoginHistoryCard() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <Card className="border-gray-800 bg-black text-white">
      <CardContent className="p-4">
        <h3 className="text-lg font-bold">Login History</h3>
        <div className="mt-4 space-y-3">
          {(user.loginHistory || []).length === 0 ? (
            <p className="text-sm text-gray-400">No login history yet.</p>
          ) : (
            user.loginHistory?.map((entry, index) => (
              <div
                key={`${entry.loggedInAt}-${index}`}
                className="rounded-2xl border border-gray-800 bg-gray-950/50 p-3 text-sm"
              >
                <p>{entry.browser}</p>
                <p className="text-gray-400">{entry.operatingSystem}</p>
                <p className="text-gray-400">
                  {entry.deviceCategory} · {entry.ipAddress}
                </p>
                <p className="text-gray-500">
                  {new Date(entry.loggedInAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
