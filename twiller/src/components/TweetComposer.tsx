import { useAuth } from "@/context/AuthContext";
import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import {
  Image as ImageIcon,
  Smile,
  Calendar,
  MapPin,
  BarChart3,
  Globe,
  Mic,
  Square,
} from "lucide-react";
import { Separator } from "./ui/separator";
import axios from "axios";
import axiosInstance from "@/lib/axiosInstance";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/context/firebase";

const MAX_AUDIO_DURATION_SECONDS = 5 * 60;
const MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024;
const AUDIO_WINDOW_START_HOUR_IST = 14;
const AUDIO_WINDOW_END_HOUR_IST = 19;

interface ComposerTweet {
  _id: string;
  content: string;
  author?: {
    _id: string;
    username: string;
    displayName: string;
    avatar: string;
    verified?: boolean;
  };
  image?: string | null;
  audioUrl?: string | null;
  audioDurationSeconds?: number | null;
  audioFileSizeBytes?: number | null;
  likes?: number;
  retweets?: number;
  comments?: number;
}

interface TweetComposerProps {
  onTweetPosted: (tweet: ComposerTweet) => void;
}

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const formatDuration = (durationSeconds: number) => {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const getIstDateParts = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value || 0
  );

  return { hour, minute };
};

const isWithinAudioWindow = () => {
  const { hour, minute } = getIstDateParts();
  const currentMinutes = hour * 60 + minute;
  const startMinutes = AUDIO_WINDOW_START_HOUR_IST * 60;
  const endMinutes = AUDIO_WINDOW_END_HOUR_IST * 60;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
};

const getAudioDurationSeconds = (file: File) =>
  new Promise<number>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement("audio");

    audio.preload = "metadata";
    audio.src = objectUrl;

    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(objectUrl);
      resolve(duration);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to read audio metadata."));
    };
  });

const TweetComposer = ({ onTweetPosted }: TweetComposerProps) => {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [imageurl, setimageurl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState("");
  const [audioDurationSeconds, setAudioDurationSeconds] = useState(0);
  const [audioError, setAudioError] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isOtpRequested, setIsOtpRequested] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [audioOtpToken, setAudioOtpToken] = useState("");
  const [otpStatus, setOtpStatus] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(
    null
  );
  const recordingTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(
    null
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const maxLength = 200;

  const resetOtpState = () => {
    setOtpCode("");
    setIsOtpRequested(false);
    setIsOtpVerified(false);
    setAudioOtpToken("");
    setOtpStatus("");
  };

  const clearAudioState = () => {
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    setAudioFile(null);
    setAudioPreviewUrl("");
    setAudioDurationSeconds(0);
    setAudioError("");
    resetOtpState();
  };

  const cleanupRecorderResources = () => {
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  useEffect(() => {
    return () => {
      cleanupRecorderResources();
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
    };
  }, [audioPreviewUrl]);

  const validateAndStoreAudioFile = async (file: File) => {
    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      throw new Error("Audio files must be 100 MB or less.");
    }

    const duration = await getAudioDurationSeconds(file);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Unable to read audio duration.");
    }
    if (duration > MAX_AUDIO_DURATION_SECONDS) {
      throw new Error("Audio must be 5 minutes or less.");
    }

    clearAudioState();
    const previewUrl = URL.createObjectURL(file);
    setAudioFile(file);
    setAudioPreviewUrl(previewUrl);
    setAudioDurationSeconds(duration);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAudioError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      setAudioError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const audioBlob = new Blob(recordedChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const fileExtension = recorder.mimeType.includes("mp4")
            ? "m4a"
            : "webm";
          const recordedFile = new File(
            [audioBlob],
            `audio-tweet-${Date.now()}.${fileExtension}`,
            { type: audioBlob.type }
          );

          await validateAndStoreAudioFile(recordedFile);
        } catch (error) {
          setAudioError(
            error instanceof Error ? error.message : "Failed to prepare audio."
          );
        } finally {
          cleanupRecorderResources();
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      recordingTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, MAX_AUDIO_DURATION_SECONDS * 1000);
    } catch (error) {
      cleanupRecorderResources();
      setAudioError(
        error instanceof Error ? error.message : "Microphone access failed."
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const uploadAudioToFirebase = async () => {
    if (!audioFile || !user) return null;

    const storageRef = ref(
      storage,
      `audio-tweets/${user._id}/${Date.now()}-${audioFile.name}`
    );
    await uploadBytes(storageRef, audioFile, {
      contentType: audioFile.type,
    });

    return getDownloadURL(storageRef);
  };

  const requestAudioOtp = async () => {
    if (!user?.email) return;
    if (!audioFile) {
      setAudioError("Attach or record audio before requesting an OTP.");
      return;
    }
    if (!isWithinAudioWindow()) {
      setAudioError(
        "Audio tweets are only available between 2:00 PM and 7:00 PM IST."
      );
      return;
    }

    try {
      setIsLoading(true);
      setAudioError("");
      setOtpStatus("");
      await axiosInstance.post("/audio-otp/request", { email: user.email });
      setIsOtpRequested(true);
      setOtpStatus(`OTP sent to ${user.email}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setAudioError(error.response?.data?.error || "Failed to send OTP.");
      } else {
        setAudioError("Failed to send OTP.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const verifyAudioOtp = async () => {
    if (!user?.email || !otpCode.trim()) return;

    try {
      setIsLoading(true);
      setAudioError("");
      const res = await axiosInstance.post("/audio-otp/verify", {
        email: user.email,
        otp: otpCode.trim(),
      });
      setAudioOtpToken(res.data.verificationToken);
      setIsOtpVerified(true);
      setOtpStatus("OTP verified. Audio tweet is unlocked for this upload.");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setAudioError(error.response?.data?.error || "OTP verification failed.");
      } else {
        setAudioError("OTP verification failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const hasText = content.trim().length > 0;
    const hasAudio = Boolean(audioFile);

    if (!hasText && !hasAudio) return;
    if (hasAudio && !isWithinAudioWindow()) {
      setAudioError(
        "Audio tweets are only available between 2:00 PM and 7:00 PM IST."
      );
      return;
    }
    if (hasAudio && !isOtpVerified) {
      setAudioError("Verify the OTP sent to your email before posting audio.");
      return;
    }

    try {
      setIsLoading(true);
      setAudioError("");

      let uploadedAudioUrl = "";
      if (hasAudio) {
        uploadedAudioUrl = (await uploadAudioToFirebase()) || "";
      }

      const tweetdata = {
        author: user._id,
        content,
        image: imageurl,
        audioUrl: uploadedAudioUrl || null,
        audioDurationSeconds: hasAudio ? Math.round(audioDurationSeconds) : null,
        audioFileSizeBytes: hasAudio ? audioFile?.size || null : null,
        audioOtpToken: hasAudio ? audioOtpToken : null,
      };

      const res = await axiosInstance.post("/post", tweetdata);
      onTweetPosted(res.data);
      setContent("");
      setimageurl("");
      clearAudioState();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setAudioError(error.response?.data?.error || "Failed to post tweet.");
      } else {
        setAudioError("Failed to post tweet.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const characterCount = content.length;
  const isOverLimit = characterCount > maxLength;
  const isNearLimit = characterCount > maxLength * 0.8;
  const isAudioWindowOpen = isWithinAudioWindow();

  if (!user) return null;

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsLoading(true);
    const image = e.target.files[0];
    const formdataimg = new FormData();
    formdataimg.set("image", image);
    try {
      const res = await axios.post(
        "https://api.imgbb.com/1/upload?key=97f3fb960c3520d6a88d7e29679cf96f",
        formdataimg
      );
      const url = res.data.data.display_url;
      if (url) {
        setimageurl(url);
      }
    } catch (error) {
      console.log(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;

    try {
      setAudioError("");
      await validateAndStoreAudioFile(e.target.files[0]);
    } catch (error) {
      setAudioError(
        error instanceof Error ? error.message : "Failed to load audio."
      );
    } finally {
      e.target.value = "";
    }
  };

  return (
    <Card className="bg-black border-gray-800 border-x-0 border-t-0 rounded-none">
      <CardContent className="p-4">
        <div className="flex space-x-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={user.avatar} alt={user.displayName} />
            <AvatarFallback>{user.displayName[0]}</AvatarFallback>
          </Avatar>

          <div className="flex-1">
            <form onSubmit={handleSubmit}>
              <Textarea
                placeholder="What's happening?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="bg-transparent border-none text-xl text-white placeholder-gray-500 resize-none min-h-[120px] focus-visible:ring-0 focus-visible:ring-offset-0"
              />

              <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    htmlFor="tweetAudio"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-700 px-3 py-2 text-sm text-white hover:bg-gray-900"
                  >
                    <Mic className="h-4 w-4" />
                    Upload audio
                    <input
                      type="file"
                      accept="audio/*"
                      id="tweetAudio"
                      className="hidden"
                      onChange={handleAudioUpload}
                      disabled={isLoading || isRecording}
                    />
                  </label>

                  {isRecording ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={stopRecording}
                      className="rounded-full border-red-600 bg-red-950/40 text-red-200 hover:bg-red-950/60"
                    >
                      <Square className="mr-2 h-4 w-4" />
                      Stop recording {formatDuration(recordingSeconds)}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={startRecording}
                      disabled={isLoading}
                      className="rounded-full border-gray-700 bg-transparent text-white hover:bg-gray-900"
                    >
                      <Mic className="mr-2 h-4 w-4" />
                      Record audio
                    </Button>
                  )}

                  <span className="text-sm text-gray-400">
                    Audio tweets: max 5 min, max 100 MB, 2:00 PM to 7:00 PM IST
                  </span>
                </div>

                {audioFile && (
                  <div className="mt-4 rounded-xl border border-gray-800 bg-black/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {audioFile.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDuration(audioDurationSeconds)} ·{" "}
                          {formatBytes(audioFile.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={clearAudioState}
                        className="rounded-full text-gray-300 hover:bg-gray-900"
                      >
                        Remove
                      </Button>
                    </div>

                    <audio controls src={audioPreviewUrl} className="mt-3 w-full" />

                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="Enter email OTP"
                        className="h-10 rounded-full border border-gray-700 bg-black px-4 text-sm text-white outline-none placeholder:text-gray-500"
                        disabled={!isOtpRequested || isLoading}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={requestAudioOtp}
                        disabled={isLoading || !isAudioWindowOpen}
                        className="rounded-full border-gray-700 bg-transparent text-white hover:bg-gray-900"
                      >
                        Send OTP
                      </Button>
                      <Button
                        type="button"
                        onClick={verifyAudioOtp}
                        disabled={isLoading || !isOtpRequested || !otpCode.trim()}
                        className="rounded-full bg-blue-500 text-white hover:bg-blue-600"
                      >
                        Verify OTP
                      </Button>
                    </div>

                    <div className="mt-2 text-xs">
                      <p
                        className={
                          isAudioWindowOpen ? "text-green-400" : "text-yellow-400"
                        }
                      >
                        {isAudioWindowOpen
                          ? "Audio tweet posting window is open."
                          : "Audio tweets are currently outside the allowed IST window."}
                      </p>
                      {otpStatus && <p className="mt-1 text-blue-400">{otpStatus}</p>}
                    </div>
                  </div>
                )}

                {audioError && (
                  <p className="mt-3 text-sm text-red-400">{audioError}</p>
                )}
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center space-x-4 text-blue-400">
                  <label
                    htmlFor="tweetImage"
                    className="p-2 rounded-full hover:bg-blue-900/20 cursor-pointer"
                  >
                    <ImageIcon className="h-5 w-5" />
                    <input
                      type="file"
                      accept="image/*"
                      id="tweetImage"
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={isLoading}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 rounded-full hover:bg-blue-900/20"
                    type="button"
                  >
                    <BarChart3 className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 rounded-full hover:bg-blue-900/20"
                    type="button"
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 rounded-full hover:bg-blue-900/20"
                    type="button"
                  >
                    <Calendar className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 rounded-full hover:bg-blue-900/20"
                    type="button"
                  >
                    <MapPin className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Globe className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-blue-400 font-semibold">
                      Everyone can reply
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    {characterCount > 0 && (
                      <div className="flex items-center space-x-2">
                        <div className="relative w-8 h-8">
                          <svg className="w-8 h-8 transform -rotate-90">
                            <circle
                              cx="16"
                              cy="16"
                              r="14"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                              className="text-gray-700"
                            />
                            <circle
                              cx="16"
                              cy="16"
                              r="14"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                              strokeDasharray={`${2 * Math.PI * 14}`}
                              strokeDashoffset={`${
                                2 *
                                Math.PI *
                                14 *
                                (1 - characterCount / maxLength)
                              }`}
                              className={
                                isOverLimit
                                  ? "text-red-500"
                                  : isNearLimit
                                  ? "text-yellow-500"
                                  : "text-blue-500"
                              }
                            />
                          </svg>
                        </div>
                        {isNearLimit && (
                          <span
                            className={`text-sm ${
                              isOverLimit ? "text-red-500" : "text-yellow-500"
                            }`}
                          >
                            {maxLength - characterCount}
                          </span>
                        )}
                      </div>
                    )}
                    <Separator
                      orientation="vertical"
                      className="h-6 bg-gray-700"
                    />

                    <Button
                      type="submit"
                      disabled={
                        (!content.trim() && !audioFile) ||
                        isOverLimit ||
                        isLoading ||
                        isRecording ||
                        (Boolean(audioFile) && !isOtpVerified)
                      }
                      className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-full px-6"
                    >
                      Post
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TweetComposer;
