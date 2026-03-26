"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { auth } from "./firebase";
import axiosInstance from "../lib/axiosInstance";

interface LoginHistoryEntry {
  browser: string;
  operatingSystem: string;
  deviceCategory: string;
  ipAddress: string;
  loggedInAt: string;
}

interface User {
  _id: string;
  username: string;
  displayName: string;
  avatar: string;
  bio?: string;
  joinedDate: string;
  email: string;
  website: string;
  location: string;
  phone?: string;
  notificationsEnabled?: boolean;
  preferredLanguage?: string;
  subscriptionPlan?: "FREE" | "BRONZE" | "SILVER" | "GOLD";
  subscriptionValidUntil?: string | null;
  loginHistory?: LoginHistoryEntry[];
}

interface ProfileUpdateData {
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  avatar?: string;
  phone?: string;
  notificationsEnabled?: boolean;
  preferredLanguage?: string;
  subscriptionPlan?: "FREE" | "BRONZE" | "SILVER" | "GOLD";
  subscriptionValidUntil?: string | null;
  loginHistory?: LoginHistoryEntry[];
}

interface RegisterPayload {
  username: string;
  displayName: string;
  avatar: string;
  email: string | null;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    username: string,
    displayName: string,
    phone?: string
  ) => Promise<void>;
  updateProfile: (profileData: ProfileUpdateData) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  googlesignin: () => void;
  refreshUser: (email?: string) => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async (email?: string) => {
    const targetEmail = email || auth.currentUser?.email;
    if (!targetEmail) {
      setUser(null);
      localStorage.removeItem("twitter-user");
      return null;
    }

    const res = await axiosInstance.get("/loggedinuser", {
      params: { email: targetEmail },
    });

    if (res.data) {
      setUser(res.data);
      localStorage.setItem("twitter-user", JSON.stringify(res.data));
      return res.data;
    }

    return null;
  };

  const requestLoginChallenge = async (email: string) => {
    const requestRes = await axiosInstance.post("/login-access/request", {
      email,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    });

    const { challengeId, requiresOtp, browser } = requestRes.data;

    if (requiresOtp) {
      const otp = window.prompt(
        `Enter the OTP sent to your email for ${browser} login`
      );

      if (!otp) {
        throw new Error("Login OTP is required.");
      }

      await axiosInstance.post("/login-access/verify", {
        challengeId,
        otp,
      });
    }

    return challengeId as string;
  };

  const recordLoginHistory = async (email: string, challengeId: string) => {
    await axiosInstance.post("/login-history/record", {
      email,
      challengeId,
    });
  };

  useEffect(() => {
    const unsubcribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser?.email) {
        try {
          await refreshUser(firebaseUser.email);
        } catch (err) {
          console.log("Failed to fetch user:", err);
        }
      } else {
        setUser(null);
        localStorage.removeItem("twitter-user");
      }
      setIsLoading(false);
    });
    return () => unsubcribe();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const challengeId = await requestLoginChallenge(email);
      const usercred = await signInWithEmailAndPassword(auth, email, password);
      const firebaseuser = usercred.user;
      if (!firebaseuser.email) {
        throw new Error("Missing user email.");
      }

      await recordLoginHistory(firebaseuser.email, challengeId);
      await refreshUser(firebaseuser.email);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.error || "Login failed");
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    email: string,
    password: string,
    username: string,
    displayName: string,
    phone?: string
  ) => {
    setIsLoading(true);
    try {
      const usercred = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const firebaseuser = usercred.user;
      const newuser: RegisterPayload = {
        username,
        displayName,
        avatar:
          firebaseuser.photoURL ||
          "https://images.pexels.com/photos/1139743/pexels-photo-1139743.jpeg?auto=compress&cs=tinysrgb&w=400",
        email: firebaseuser.email,
        phone,
      };
      await axiosInstance.post("/register", newuser);
      await refreshUser(firebaseuser.email || undefined);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setUser(null);
    await signOut(auth);
    localStorage.removeItem("twitter-user");
  };

  const updateProfile = async (profileData: ProfileUpdateData) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const updatedUser: User = {
        ...user,
        ...profileData,
      };
      const res = await axiosInstance.patch(
        `/userupdate/${user.email}`,
        updatedUser
      );
      if (res.data) {
        setUser(res.data);
        localStorage.setItem("twitter-user", JSON.stringify(res.data));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const googlesignin = async () => {
    setIsLoading(true);

    try {
      const googleauthprovider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, googleauthprovider);
      const firebaseuser = result.user;

      if (!firebaseuser?.email) {
        throw new Error("No email found in Google account");
      }

      const challengeId = await requestLoginChallenge(firebaseuser.email);

      let userData: User | undefined;

      try {
        userData = await refreshUser(firebaseuser.email);
      } catch {
        const newuser: RegisterPayload = {
          username: firebaseuser.email.split("@")[0],
          displayName: firebaseuser.displayName || "User",
          avatar:
            firebaseuser.photoURL ||
            "https://images.pexels.com/photos/1139743/pexels-photo-1139743.jpeg?auto=compress&cs=tinysrgb&w=400",
          email: firebaseuser.email,
        };

        const registerRes = await axiosInstance.post("/register", newuser);
        userData = registerRes.data;
        setUser(userData);
      }

      await recordLoginHistory(firebaseuser.email, challengeId);

      if (userData) {
        setUser(userData);
        localStorage.setItem("twitter-user", JSON.stringify(userData));
      } else {
        throw new Error("Login/Register failed: No user data returned");
      }
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error || "Login failed"
        : error instanceof Error
        ? error.message
        : "Login failed";
      console.error("Google Sign-In Error:", error);
      alert(message);
      await signOut(auth);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        updateProfile,
        logout,
        isLoading,
        googlesignin,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
