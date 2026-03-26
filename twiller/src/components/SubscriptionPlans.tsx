"use client";

import { useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const plans = [
  { key: "FREE", name: "Free", price: 0, tweets: "1 tweet" },
  { key: "BRONZE", name: "Bronze", price: 100, tweets: "3 tweets" },
  { key: "SILVER", name: "Silver", price: 300, tweets: "5 tweets" },
  { key: "GOLD", name: "Gold", price: 1000, tweets: "Unlimited tweets" },
] as const;

const ensureRazorpayScript = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function SubscriptionPlans() {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadingPlan, setLoadingPlan] = useState("");

  if (!user) return null;

  const handlePlanPurchase = async (planKey: string) => {
    if (planKey === "FREE") return;

    try {
      setLoadingPlan(planKey);
      setError("");
      setStatus("");

      const hasScript = await ensureRazorpayScript();
      if (!hasScript || !window.Razorpay) {
        throw new Error("Razorpay checkout failed to load.");
      }

      const orderRes = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/payment/order`,
        {
          userId: user._id,
          plan: planKey,
        }
      );

      const razorpay = new window.Razorpay({
        key: orderRes.data.keyId,
        amount: orderRes.data.amount,
        currency: orderRes.data.currency,
        name: "Twiller",
        description: `${planKey} subscription`,
        order_id: orderRes.data.orderId,
        prefill: {
          name: user.displayName,
          email: user.email,
          contact: user.phone,
        },
        handler: async (response: Record<string, string>) => {
          const verifyRes = await axios.post(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/payment/verify`,
            response
          );
          setStatus(verifyRes.data.message);
          await refreshUser(user.email);
        },
      });

      razorpay.open();
    } catch (purchaseError) {
      if (axios.isAxiosError(purchaseError)) {
        setError(purchaseError.response?.data?.error || "Payment failed.");
      } else if (purchaseError instanceof Error) {
        setError(purchaseError.message);
      } else {
        setError("Payment failed.");
      }
    } finally {
      setLoadingPlan("");
    }
  };

  return (
    <Card className="border-gray-800 bg-black text-white">
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="text-lg font-bold">Subscription Plans</h3>
          <p className="text-sm text-gray-400">
            Current plan: {user.subscriptionPlan || "FREE"}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className="rounded-2xl border border-gray-800 bg-gray-950/50 p-4"
            >
              <p className="text-lg font-semibold">{plan.name}</p>
              <p className="text-sm text-gray-400">{plan.tweets}</p>
              <p className="mt-2 text-xl font-bold">
                {plan.price === 0 ? "Free" : `Rs.${plan.price}/month`}
              </p>
              <Button
                type="button"
                onClick={() => handlePlanPurchase(plan.key)}
                disabled={loadingPlan === plan.key || plan.key === user.subscriptionPlan}
                className="mt-3 w-full rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-700"
              >
                {plan.key === "FREE"
                  ? "Default"
                  : loadingPlan === plan.key
                  ? "Processing..."
                  : user.subscriptionPlan === plan.key
                  ? "Active"
                  : "Choose Plan"}
              </Button>
            </div>
          ))}
        </div>
        {status && <p className="text-sm text-green-400">{status}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}
