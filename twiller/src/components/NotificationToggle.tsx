"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "./ui/button";

const NotificationToggle = () => {
  const { user, updateProfile, isLoading } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [permission, setPermission] = useState("unsupported");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);
  }, []);

  const sendTestNotification = () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    new Notification("Twiller notifications are working", {
      body: "You will now get alerts for tweets containing cricket or science.",
      tag: "notifications-enabled-test",
    });
  };

  if (!user) return null;

  const notificationsEnabled = Boolean(user.notificationsEnabled);

  const handleToggle = async () => {
    if (isSaving) return;

    const nextEnabled = !notificationsEnabled;

    if (nextEnabled) {
      if (typeof window === "undefined" || !("Notification" in window)) {
        window.alert("This browser does not support notifications.");
        return;
      }

      let permission = Notification.permission;

      if (permission !== "granted") {
        permission = await Notification.requestPermission();
        setPermission(permission);
      }

      if (permission !== "granted") {
        window.alert("Notification permission was not granted.");
        return;
      }
    }

    try {
      setIsSaving(true);
      await updateProfile({ notificationsEnabled: nextEnabled });
      if (nextEnabled) {
        sendTestNotification();
      }
    } catch (error) {
      console.error("Failed to update notification preference", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-2xl border border-gray-800 bg-gray-950/80 px-4 py-3">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isSaving || isLoading}
        className="flex flex-1 items-start gap-3 text-left"
      >
        <div className="rounded-full bg-blue-500/15 p-2">
          <Bell className="h-4 w-4 text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            Keyword notifications
          </p>
          <p className="text-sm text-gray-400">
            Notify me when a tweet mentions cricket or science.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Browser permission: {permission}
          </p>
        </div>
      </button>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={sendTestNotification}
          disabled={permission !== "granted"}
          className="rounded-full border-gray-700 bg-transparent px-4 text-white hover:bg-gray-900"
        >
          Test
        </Button>
        <Button
          type="button"
          onClick={handleToggle}
          disabled={isSaving || isLoading}
          className={`rounded-full px-4 ${
            notificationsEnabled
              ? "bg-blue-500 hover:bg-blue-600 text-white"
              : "bg-gray-800 hover:bg-gray-700 text-gray-100"
          }`}
        >
          {notificationsEnabled ? "On" : "Off"}
        </Button>
      </div>
    </div>
  );
};

export default NotificationToggle;
