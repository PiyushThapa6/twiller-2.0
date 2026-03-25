import React, { useCallback, useEffect, useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Card, CardContent } from "./ui/card";
import LoadingSpinner from "./loading-spinner";
import TweetCard from "./TweetCard";
import TweetComposer from "./TweetComposer";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";

interface Tweet {
  _id: string;
  author: {
    _id: string;
    username: string;
    displayName: string;
    avatar: string;
    verified?: boolean;
  };
  content: string;
  timestamp: string;
  likes: number;
  retweets: number;
  comments: number;
  liked?: boolean;
  retweeted?: boolean;
  image?: string;
}
const Feed = () => {
  const { user } = useAuth();
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setloading] = useState(false);
  const seenTweetIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedFeedRef = useRef(false);

  const shouldNotifyForTweet = useCallback((tweet: Tweet) => {
    if (!user?.notificationsEnabled) return false;
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    if (Notification.permission !== "granted") return false;
    if (!tweet._id || seenTweetIdsRef.current.has(tweet._id)) return false;

    const content = tweet.content.toLowerCase();
    return content.includes("cricket") || content.includes("science");
  }, [user?.notificationsEnabled]);

  const notifyForTweet = useCallback((tweet: Tweet) => {
    new Notification("Keyword tweet alert", {
      body: tweet.content,
      tag: `tweet-${tweet._id}`,
    });
  }, []);

  const fetchTweets = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setloading(true);
      }
      const res = await axiosInstance.get("/post");
      const nextTweets: Tweet[] = Array.isArray(res.data) ? res.data : [];

      if (hasInitializedFeedRef.current) {
        nextTweets.forEach((tweet) => {
          if (shouldNotifyForTweet(tweet)) {
            notifyForTweet(tweet);
          }
        });
      }

      seenTweetIdsRef.current = new Set(
        nextTweets.filter((tweet) => tweet._id).map((tweet) => tweet._id)
      );
      hasInitializedFeedRef.current = true;
      setTweets(nextTweets);
    } catch (error) {
      console.error(error);
    } finally {
      if (!options?.silent) {
        setloading(false);
      }
    }
  }, [notifyForTweet, shouldNotifyForTweet]);

  useEffect(() => {
    fetchTweets();
  }, [fetchTweets]);

  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      fetchTweets({ silent: true });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [fetchTweets, user]);

  const handlenewtweet = (newtweet: Tweet) => {
    const hasKeyword =
      newtweet.content.toLowerCase().includes("cricket") ||
      newtweet.content.toLowerCase().includes("science");

    if (
      user?.notificationsEnabled &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      hasKeyword
    ) {
      notifyForTweet(newtweet);
    }

    if (newtweet._id) {
      seenTweetIdsRef.current.add(newtweet._id);
    }
    setTweets((prev) => [newtweet, ...prev]);
  };
  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10">
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold text-white">Home</h1>
        </div>

        <Tabs defaultValue="foryou" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-transparent border-b border-gray-800 rounded-none h-auto">
            <TabsTrigger
              value="foryou"
              className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-1 data-[state=active]:border-blue-100 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
            >
              For you
            </TabsTrigger>
            <TabsTrigger
              value="following"
              className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-1 data-[state=active]:border-blue-100 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
            >
              Following
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <TweetComposer onTweetPosted={handlenewtweet} />
      <div className="divide-y divide-gray-800">
        {loading ? (
          <Card className="bg-black border-none">
            <CardContent className="py-12 text-center">
              <div className="text-gray-400 mb-4">
                <LoadingSpinner size="lg" className="mx-auto mb-4" />
                <p>Loading tweets...</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          tweets.map((tweet) => <TweetCard key={tweet._id} tweet={tweet} />)
        )}
      </div>
    </div>
  );
};

export default Feed;
