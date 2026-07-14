"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  Captions,
  Check,
  ExternalLink,
  Gauge,
  Info,
  ListVideo,
  Loader2,
  Maximize,
  Pause,
  Play,
  StepBack,
  StepForward,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button, IconSwap } from "@/components/ui";
import { BackButton } from "@/components/features/BackButton";
import { showToast } from "@/components/features/ToastHost";
import { cn } from "@/lib/cn";

interface PlayerClientProps {
  animeId: number;
  episodeNumber: number;
  mediaType: "anime" | "drama" | "movie";
  animeTitle: string;
  episodeTitle: string | null;
  coverUrl: string | null;
  initialPositionSeconds: number;
  initialDurationSeconds: number;
  initialCompleted: boolean;
  playerEpisodes: PlayerEpisodeItem[];
  previousPlayableEpisode: number | null;
  nextPlayableEpisode: number | null;
  autoPlayOnReady: boolean;
  canOpenExternalPlayer: boolean;
}

interface PlayerEpisodeItem {
  id: number;
  number: number;
  title: string | null;
  isPlayable: boolean;
  isWatched: boolean;
  isTrackingCurrent: boolean;
  playbackPositionSeconds: number;
  playbackDurationSeconds: number;
  playbackCompleted: boolean;
}

interface SaveProgressResponse {
  completed?: boolean;
  currentEpisode?: number;
  watchStatus?: string;
}

interface ProgressPayload {
  positionSeconds: number;
  durationSeconds: number;
}

type VideoErrorKind = "network" | "decode" | "file" | "playback";

interface SubtitleTrackItem {
  name: string;
  label: string;
  url: string;
}

const SAVE_INTERVAL_SECONDS = 10;
const PLAYER_RATE_KEY = "anime-player:playback-rate";
const PLAYER_VOLUME_KEY = "anime-player:volume";
const PLAYER_MUTED_KEY = "anime-player:muted";
const PLAYER_AUTOPLAY_KEY = "anime-player:auto-play";
const PLAYER_SUBTITLES_KEY = "anime-player:subtitles-enabled";
const AUTO_PLAY_COUNTDOWN_SECONDS = 5;
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];
const FULLSCREEN_CONTROLS_IDLE_MS = 2200;
const MEDIA_ERROR_NETWORK = 2;
const MEDIA_ERROR_DECODE = 3;
const MEDIA_ERROR_SOURCE_UNSUPPORTED = 4;

export function PlayerClient({
  animeId,
  episodeNumber,
  mediaType,
  animeTitle,
  coverUrl,
  initialPositionSeconds,
  initialDurationSeconds,
  initialCompleted,
  playerEpisodes,
  previousPlayableEpisode,
  nextPlayableEpisode,
  autoPlayOnReady,
  canOpenExternalPlayer,
}: PlayerClientProps) {
  const router = useRouter();
  const streamUrl = useMemo(
    () => `/api/player/stream?animeId=${animeId}&episode=${episodeNumber}`,
    [animeId, episodeNumber],
  );
  const theaterRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const restoredRef = useRef(false);
  const autoPlayAttemptedRef = useRef(false);
  const compatibleAutoPlayRef = useRef(false);
  const compatibleTaskIdRef = useRef<string | null>(null);
  const compatibleRequestGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const lastSavedPositionRef = useRef(initialPositionSeconds);
  const pendingProgressRef = useRef<ProgressPayload | null>(null);
  const progressSaveInFlightRef = useRef<Promise<boolean> | null>(null);
  const controlsHideTimerRef = useRef<number | null>(null);
  const [position, setPosition] = useState(initialPositionSeconds);
  const [duration, setDuration] = useState(initialDurationSeconds);
  const [completed, setCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoErrorKind, setVideoErrorKind] = useState<VideoErrorKind | null>(
    null,
  );
  const [videoSource, setVideoSource] = useState(streamUrl);
  const [playbackMode, setPlaybackMode] = useState<"range" | "compatible">(
    "range",
  );
  const [compatiblePending, setCompatiblePending] = useState(false);
  const [nativeHlsSupported, setNativeHlsSupported] = useState(false);
  const [externalPending, setExternalPending] = useState(false);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [autoPlayCountdown, setAutoPlayCountdown] = useState<number | null>(
    null,
  );
  const [episodePanelOpen, setEpisodePanelOpen] = useState(false);
  const [episodePanelMounted, setEpisodePanelMounted] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [isTheaterFullscreen, setIsTheaterFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsFocused, setControlsFocused] = useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrackItem[]>([]);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [selectedSubtitleUrl, setSelectedSubtitleUrl] = useState<string | null>(
    null,
  );

  const detailHref =
    mediaType === "anime" ? `/anime/${animeId}` : `/cinema/${animeId}`;
  const episodeUnit = mediaType === "anime" ? "话" : "集";
  const episodeHeading = `第 ${String(episodeNumber).padStart(2, "0")} ${episodeUnit}`;
  const progressRatio = duration > 0 ? Math.min(1, position / duration) : 0;
  const progressPercent = Math.round(progressRatio * 100);
  const hasReachedEpisodeEnd = duration > 0 && position >= duration - 1;
  const shouldShowVideoPoster =
    !!coverUrl && (position <= 0 || hasReachedEpisodeEnd || completed);
  const seekMax = Math.max(duration, position, 1);
  const seekValue = Math.min(position, seekMax);
  const volumeFill = muted ? 0 : volume;
  const volumeStyle = {
    "--player-range-fill": `${volumeFill}%`,
  } as CSSProperties;
  const shouldAutoHideControls =
    isTheaterFullscreen &&
    isPlaying &&
    !settingsPanelOpen &&
    !episodePanelOpen &&
    autoPlayCountdown === null &&
    !videoError &&
    !controlsFocused;
  const resumePosition =
    initialCompleted && initialDurationSeconds - initialPositionSeconds <= 90
      ? 0
      : initialPositionSeconds;

  const openEpisodePanel = useCallback(() => {
    setSettingsPanelOpen(false);
    setEpisodePanelMounted(true);
    setEpisodePanelOpen(true);
  }, []);

  const closeEpisodePanel = useCallback(() => {
    setEpisodePanelOpen(false);
  }, []);

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimerRef.current === null) return;
    window.clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = null;
  }, []);

  const scheduleControlsHide = useCallback(() => {
    clearControlsHideTimer();
    if (!shouldAutoHideControls) return;
    controlsHideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      controlsHideTimerRef.current = null;
    }, FULLSCREEN_CONTROLS_IDLE_MS);
  }, [clearControlsHideTimer, shouldAutoHideControls]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  const cancelCompatibleTaskById = useCallback(
    async (taskId: string, keepalive = false): Promise<void> => {
      try {
        await fetch(`/api/player/compatible/${encodeURIComponent(taskId)}`, {
          method: "DELETE",
          cache: "no-store",
          keepalive,
        });
      } catch {}
    },
    [],
  );

  const cancelActiveCompatibleTask = useCallback(
    (keepalive = false): Promise<void> => {
      const taskId = compatibleTaskIdRef.current;
      compatibleTaskIdRef.current = null;
      if (!taskId) return Promise.resolve();
      return cancelCompatibleTaskById(taskId, keepalive);
    },
    [cancelCompatibleTaskById],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      compatibleRequestGenerationRef.current += 1;
      void cancelActiveCompatibleTask(true);
    };
  }, [cancelActiveCompatibleTask]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsTheaterFullscreen(document.fullscreenElement === theaterRef.current);
    };

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!shouldAutoHideControls) {
      clearControlsHideTimer();
      setControlsVisible(true);
      return;
    }

    setControlsVisible(true);
    scheduleControlsHide();
    return clearControlsHideTimer;
  }, [clearControlsHideTimer, scheduleControlsHide, shouldAutoHideControls]);

  useEffect(() => {
    setVolume(readStoredNumber(PLAYER_VOLUME_KEY, 80, 0, 100));
    setMuted(readStoredBoolean(PLAYER_MUTED_KEY, false));
    setPlaybackRate(readStoredNumber(PLAYER_RATE_KEY, 1, 0.25, 4));
    setAutoPlayEnabled(readStoredBoolean(PLAYER_AUTOPLAY_KEY, true));
    setSubtitlesEnabled(readStoredBoolean(PLAYER_SUBTITLES_KEY, false));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume / 100;
    video.muted = muted;
    video.playbackRate = playbackRate;
  }, [muted, playbackRate, volume]);

  useEffect(() => {
    const video = videoRef.current;
    setNativeHlsSupported(
      !!video?.canPlayType("application/vnd.apple.mpegurl"),
    );
  }, []);

  useEffect(() => {
    compatibleRequestGenerationRef.current += 1;
    void cancelActiveCompatibleTask(true);
    setVideoSource(streamUrl);
    setPlaybackMode("range");
    setVideoError(null);
    setVideoErrorKind(null);
    restoredRef.current = false;
    autoPlayAttemptedRef.current = false;
  }, [cancelActiveCompatibleTask, streamUrl]);

  useEffect(() => {
    writeStoredNumber(PLAYER_VOLUME_KEY, volume);
  }, [volume]);

  useEffect(() => {
    writeStoredBoolean(PLAYER_MUTED_KEY, muted);
  }, [muted]);

  useEffect(() => {
    writeStoredNumber(PLAYER_RATE_KEY, playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    writeStoredBoolean(PLAYER_AUTOPLAY_KEY, autoPlayEnabled);
  }, [autoPlayEnabled]);

  useEffect(() => {
    writeStoredBoolean(PLAYER_SUBTITLES_KEY, subtitlesEnabled);
  }, [subtitlesEnabled]);

  useEffect(() => {
    if (episodePanelOpen) {
      setEpisodePanelMounted(true);
      return;
    }
    if (!episodePanelMounted) return;
    const timer = window.setTimeout(() => {
      setEpisodePanelMounted(false);
    }, readRootDurationMs("--panel-close-dur", 350));
    return () => window.clearTimeout(timer);
  }, [episodePanelMounted, episodePanelOpen]);

  useEffect(() => {
    let cancelled = false;
    setSubtitleTracks([]);
    setSelectedSubtitleUrl(null);
    fetch(`/api/player/subtitles?animeId=${animeId}&episode=${episodeNumber}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { subtitles?: SubtitleTrackItem[] } | null) => {
        if (cancelled) return;
        const tracks = Array.isArray(data?.subtitles) ? data.subtitles : [];
        setSubtitleTracks(tracks);
        setSelectedSubtitleUrl(tracks[0]?.url ?? null);
      })
      .catch(() => {
        if (!cancelled) setSubtitleTracks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [animeId, episodeNumber]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (let i = 0; i < video.textTracks.length; i += 1) {
      video.textTracks[i].mode =
        subtitlesEnabled && selectedSubtitleUrl ? "showing" : "disabled";
    }
  }, [selectedSubtitleUrl, subtitlesEnabled]);

  const sendProgressPayload = useCallback(
    async function sendProgressPayloadImpl(
      payload: ProgressPayload,
      keepalive = false,
    ): Promise<boolean> {
      pendingProgressRef.current = payload;
      const inFlight = progressSaveInFlightRef.current;
      if (inFlight) {
        const previousSaved = await inFlight;
        if (!previousSaved || pendingProgressRef.current !== payload) return false;
        return sendProgressPayloadImpl(payload, keepalive);
      }

      setSaving(true);
      const request = (async () => {
        try {
          const res = await fetch("/api/player/progress", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              animeId,
              episode: episodeNumber,
              positionSeconds: payload.positionSeconds,
              durationSeconds: payload.durationSeconds,
            }),
            keepalive,
          });
          const data = (await res.json().catch(() => null)) as
            | SaveProgressResponse
            | null;
          if (!res.ok) return false;

          lastSavedPositionRef.current = payload.positionSeconds;
          if (pendingProgressRef.current === payload) {
            pendingProgressRef.current = null;
          }
          setCompleted(!!data?.completed);
          if (typeof data?.currentEpisode === "number") {
            window.dispatchEvent(
              new CustomEvent("anime-progress-change", {
                detail: { animeId, currentEpisode: data.currentEpisode },
              }),
            );
          }
          if (data?.watchStatus) {
            window.dispatchEvent(
              new CustomEvent("anime-watch-status-change", {
                detail: { animeId, watchStatus: data.watchStatus },
              }),
            );
          }
          return true;
        } catch {
          return false;
        }
      })();
      progressSaveInFlightRef.current = request;
      try {
        return await request;
      } finally {
        progressSaveInFlightRef.current = null;
        setSaving(false);
      }
    },
    [animeId, episodeNumber],
  );

  const saveProgress = useCallback(
    async (force = false, keepalive = false) => {
      const video = videoRef.current;
      const nextPosition = Math.max(
        0,
        Math.floor(video?.currentTime ?? position),
      );
      const nextDuration = Math.max(
        0,
        Math.floor(
          Number.isFinite(video?.duration) ? video?.duration ?? duration : duration,
        ),
      );
      if (nextPosition <= 0 && nextDuration <= 0) return false;
      if (
        !force &&
        Math.abs(nextPosition - lastSavedPositionRef.current) <
          SAVE_INTERVAL_SECONDS
      ) {
        return false;
      }
      return sendProgressPayload(
        { positionSeconds: nextPosition, durationSeconds: nextDuration },
        keepalive,
      );
    },
    [duration, position, sendProgressPayload],
  );

  useEffect(() => {
    const persistProgress = () => {
      void saveProgress(true, true);
    };
    const persistBeforeLeaving = () => {
      persistProgress();
      compatibleRequestGenerationRef.current += 1;
      void cancelActiveCompatibleTask(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistProgress();
      }
    };

    window.addEventListener("pagehide", persistBeforeLeaving);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", persistBeforeLeaving);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [cancelActiveCompatibleTask, saveProgress]);

  useEffect(() => {
    const retryPendingProgress = () => {
      const pending = pendingProgressRef.current;
      if (pending) void sendProgressPayload(pending);
    };
    const timer = window.setInterval(retryPendingProgress, 15_000);
    window.addEventListener("online", retryPendingProgress);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retryPendingProgress);
    };
  }, [sendProgressPayload]);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      const base = Number.isFinite(video.currentTime) ? video.currentTime : position;
      const nextPosition = Math.min(
        Math.max(0, Math.floor(base + deltaSeconds)),
        Math.max(duration, video.duration || 0, 0),
      );
      video.currentTime = nextPosition;
      setPosition(nextPosition);
      void saveProgress(true);
    },
    [duration, position, saveProgress],
  );

  const navigateToEpisode = useCallback(
    async (targetEpisode: number | null, autoPlay = false) => {
      if (!targetEpisode || targetEpisode === episodeNumber) return;
      setAutoPlayCountdown(null);
      await saveProgress(true);
      compatibleRequestGenerationRef.current += 1;
      void cancelActiveCompatibleTask(true);
      router.push(
        `/player/${animeId}/${targetEpisode}${autoPlay ? "?autoplay=1" : ""}`,
      );
    },
    [animeId, cancelActiveCompatibleTask, episodeNumber, router, saveProgress],
  );

  useEffect(() => {
    if (autoPlayCountdown === null) return;
    if (autoPlayCountdown <= 0) {
      if (nextPlayableEpisode) {
        void navigateToEpisode(nextPlayableEpisode, true);
      }
      return;
    }
    const timer = window.setTimeout(
      () => setAutoPlayCountdown((value) => (value ?? 1) - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [autoPlayCountdown, navigateToEpisode, nextPlayableEpisode]);

  const changePlaybackRate = useCallback((nextRate: number) => {
    const safeRate = PLAYBACK_RATES.includes(nextRate) ? nextRate : 1;
    setPlaybackRate(safeRate);
    const video = videoRef.current;
    if (video) video.playbackRate = safeRate;
  }, []);

  const captureScreenshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      showToast({
        title: "截图失败",
        description: "视频画面还没有准备好",
        tone: "warning",
      });
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas_context_missing");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const capturedAt = Math.max(0, Math.floor(video.currentTime));
      canvas.toBlob((blob) => {
        if (!blob) {
          showToast({
            title: "截图失败",
            description: "浏览器没有生成图片",
            tone: "error",
          });
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          const imageData = typeof reader.result === "string" ? reader.result : "";
          try {
            const res = await fetch("/api/player/screenshots", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                imageData,
                animeTitle,
                episode: episodeNumber,
                positionSeconds: capturedAt,
              }),
            });
            const data = (await res.json().catch(() => null)) as {
              directory?: string;
              fileName?: string;
              opened?: boolean;
            } | null;
            if (!res.ok) {
              showToast({
                title: "截图保存失败",
                description: "本地服务没有写入图片",
                tone: "error",
              });
              return;
            }
            showToast({
              title: "截图已保存",
              description: data?.opened
                ? `${data.fileName ?? "图片"} · 已打开目录`
                : data?.directory ?? `${formatTime(capturedAt)} 的画面`,
              tone: "success",
            });
          } catch {
            showToast({
              title: "截图保存失败",
              description: "无法连接本地保存接口",
              tone: "error",
            });
          }
        };
        reader.onerror = () => {
          showToast({
            title: "截图保存失败",
            description: "浏览器没有读取到图片数据",
            tone: "error",
          });
        };
        reader.readAsDataURL(blob);
      }, "image/png");
    } catch {
      showToast({
        title: "截图失败",
        description: "浏览器阻止了当前画面导出",
        tone: "error",
      });
    }
  }, [animeTitle, episodeNumber]);

  const openExternalPlayer = async () => {
    if (externalPending) return;
    setExternalPending(true);
    try {
      const res = await fetch("/api/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ animeId, episode: episodeNumber }),
      });
      const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        showToast({
          title: "外部播放器启动失败",
          description: data?.message ?? data?.error ?? "无法打开本地文件",
          tone: "error",
        });
        return;
      }
      showToast({ title: "正在启动外部播放器", tone: "play" });
    } catch {
      showToast({
        title: "外部播放器启动失败",
        description: "网络连接异常",
        tone: "error",
      });
    } finally {
      setExternalPending(false);
    }
  };

  const startCompatiblePlayback = async () => {
    if (compatiblePending) return;
    if (!nativeHlsSupported) {
      setVideoErrorKind("decode");
      setVideoError("当前浏览器不支持 HLS 兼容播放，请在宿主机使用外部播放器。");
      return;
    }
    setCompatiblePending(true);
    setVideoErrorKind("decode");
    setVideoError("正在由本地服务准备兼容播放，首次转码可能需要一点时间。");
    const requestGeneration = compatibleRequestGenerationRef.current + 1;
    compatibleRequestGenerationRef.current = requestGeneration;
    await cancelActiveCompatibleTask(false);
    try {
      const res = await fetch("/api/player/compatible/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ animeId, episode: episodeNumber }),
      });
      const data = (await res.json().catch(() => null)) as {
        taskId?: string;
        playlistUrl?: string;
        mode?: "remux" | "transcode";
        message?: string;
        error?: string;
      } | null;
      const taskId = data?.taskId;
      if (!res.ok || !taskId || !/^[A-Za-z0-9_-]{32}$/.test(taskId)) {
        setVideoErrorKind("playback");
        setVideoError(data?.message ?? data?.error ?? "兼容播放准备失败，可以稍后重试。");
        return;
      }

      if (
        !mountedRef.current ||
        compatibleRequestGenerationRef.current !== requestGeneration
      ) {
        await cancelCompatibleTaskById(taskId, true);
        return;
      }

      compatibleTaskIdRef.current = taskId;
      restoredRef.current = false;
      compatibleAutoPlayRef.current = true;
      setVideoError(null);
      setVideoErrorKind(null);
      setPlaybackMode("compatible");
      setVideoSource(
        `/api/player/compatible/${encodeURIComponent(taskId)}/playlist`,
      );
      showToast({
        title: data.mode === "remux" ? "已切换兼容封装" : "已切换兼容转码",
        description:
          data.mode === "remux"
            ? "视频内容保持原编码，已转换为 Safari 可读取的 HLS。"
            : "正在由本地服务转换为 H.264 与 AAC。",
        tone: "play",
      });
    } catch {
      setVideoErrorKind("network");
      setVideoError("无法连接 Bandi 本地服务，网络恢复后可以重试兼容播放。");
    } finally {
      if (mountedRef.current) setCompatiblePending(false);
    }
  };

  const handleVideoError = async () => {
    const video = videoRef.current;
    const mediaErrorCode = video?.error?.code ?? 0;
    setIsPlaying(false);

    if (!navigator.onLine || mediaErrorCode === MEDIA_ERROR_NETWORK) {
      setVideoErrorKind("network");
      setVideoError("连接中断；恢复网络后可继续，播放进度会自动重试保存。");
      return;
    }

    if (playbackMode === "compatible") {
      setVideoErrorKind("playback");
      setVideoError("兼容播放已中断，可以重新准备后继续。");
      return;
    }

    if (
      mediaErrorCode === MEDIA_ERROR_DECODE ||
      mediaErrorCode === MEDIA_ERROR_SOURCE_UNSUPPORTED
    ) {
      try {
        const check = await fetch(streamUrl, {
          headers: { Range: "bytes=0-0" },
          cache: "no-store",
        });
        if (check.status === 404 || check.status === 410) {
          const data = (await check.json().catch(() => null)) as {
            message?: string;
          } | null;
          setVideoErrorKind("file");
          setVideoError(data?.message ?? "视频文件已不在原位置，请检查宿主机媒体目录。");
          return;
        }
      } catch {
        setVideoErrorKind("network");
        setVideoError("无法读取宿主机上的视频文件，请检查网络连接。");
        return;
      }
      setVideoErrorKind("decode");
      setVideoError(
        nativeHlsSupported
          ? "Safari 无法解码当前封装或编码，可以切换兼容播放。"
          : canOpenExternalPlayer
            ? "浏览器无法解码当前文件，请使用外部播放器。"
            : "当前浏览器无法解码这个文件。请改用支持 HLS 的 Safari。",
      );
      return;
    }

    setVideoErrorKind("playback");
    setVideoError("播放被中断，可以稍后重试。");
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume / 100;
    video.muted = muted;
    video.playbackRate = playbackRate;
    const nextDuration = Number.isFinite(video.duration)
      ? Math.floor(video.duration)
      : initialDurationSeconds;
    setDuration(nextDuration);
    if (
      !restoredRef.current &&
      resumePosition > 5 &&
      (nextDuration <= 0 || resumePosition < nextDuration - 5)
    ) {
      video.currentTime = resumePosition;
      setPosition(resumePosition);
    }
    restoredRef.current = true;
    if (compatibleAutoPlayRef.current) {
      compatibleAutoPlayRef.current = false;
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setVideoErrorKind("playback");
          setVideoError("兼容视频已经就绪，点一下播放按钮即可继续。");
        });
      return;
    }
    if (autoPlayOnReady && !autoPlayAttemptedRef.current) {
      autoPlayAttemptedRef.current = true;
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          showToast({
            title: "自动播放被浏览器拦截",
            description: "点一下播放按钮即可继续",
            tone: "warning",
          });
        });
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextPosition = Math.floor(video.currentTime);
    setPosition(nextPosition);
    if (Number.isFinite(video.duration)) {
      setDuration(Math.floor(video.duration));
    }
    void saveProgress(false);
  };

  const handleEnded = () => {
    const video = videoRef.current;
    setIsPlaying(false);
    if (video && Number.isFinite(video.duration)) {
      setPosition(Math.floor(video.duration));
      setDuration(Math.floor(video.duration));
    }
    void saveProgress(true);
    if (autoPlayEnabled && nextPlayableEpisode) {
      setAutoPlayCountdown(AUTO_PLAY_COUNTDOWN_SECONDS);
    }
  };

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setAutoPlayCountdown(null);

    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setVideoErrorKind("playback");
        setVideoError(
          canOpenExternalPlayer
            ? "浏览器暂时无法开始播放，可以再点一次或使用外部播放器。"
            : "浏览器暂时无法开始播放，可以再点一次。",
        );
      }
      return;
    }

    video.pause();
    setIsPlaying(false);
  }, [canOpenExternalPlayer]);

  const handleSeekChange = (nextValue: number) => {
    const video = videoRef.current;
    if (!video) return;

    setAutoPlayCountdown(null);
    const nextPosition = Math.min(Math.max(0, Math.floor(nextValue)), seekMax);
    video.currentTime = nextPosition;
    setPosition(nextPosition);
    void saveProgress(true);
  };

  const handleVolumeChange = (nextValue: number) => {
    const nextVolume = Math.min(100, Math.max(0, Math.floor(nextValue)));
    const video = videoRef.current;
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
    if (video) {
      video.volume = nextVolume / 100;
      video.muted = nextVolume === 0;
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (video) {
      video.muted = nextMuted;
    }
  };

  const requestTheaterFullscreen = async () => {
    const theater = theaterRef.current;
    if (!theater) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await theater.requestFullscreen();
    } catch {
      showToast({
        title: "无法进入全屏",
        description: "当前浏览器拒绝了全屏请求",
        tone: "error",
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      revealControls();

      if (key === " " || key === "k") {
        event.preventDefault();
        void togglePlayback();
        return;
      }
      if (key === "arrowleft" || key === "j") {
        event.preventDefault();
        seekBy(-10);
        return;
      }
      if (key === "arrowright" || key === "l") {
        event.preventDefault();
        seekBy(10);
        return;
      }
      if (key === "arrowup") {
        event.preventDefault();
        handleVolumeChange(volume + 5);
        return;
      }
      if (key === "arrowdown") {
        event.preventDefault();
        handleVolumeChange(volume - 5);
        return;
      }
      if (key === "m") {
        event.preventDefault();
        toggleMute();
        return;
      }
      if (key === "f") {
        event.preventDefault();
        void requestTheaterFullscreen();
        return;
      }
      if (key === "c") {
        event.preventDefault();
        captureScreenshot();
        return;
      }
      if (key === "n") {
        event.preventDefault();
        void navigateToEpisode(nextPlayableEpisode);
        return;
      }
      if (key === "b") {
        event.preventDefault();
        void navigateToEpisode(previousPlayableEpisode);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    captureScreenshot,
    navigateToEpisode,
    nextPlayableEpisode,
    previousPlayableEpisode,
    revealControls,
    seekBy,
    togglePlayback,
    volume,
  ]);

  return (
    <section className="desktop-player-shell relative min-h-[calc(100vh-64px)] overflow-hidden bg-black px-4 py-5 sm:px-6 lg:px-8">
      {coverUrl && (
        <div
          className="absolute inset-0 scale-105 bg-cover bg-center opacity-18 blur-2xl"
          style={{ backgroundImage: `url(${coverUrl})` }}
        />
      )}
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.82)]" />
      <div className="fixed left-4 top-20 z-40 sm:left-6 lg:left-8">
        <BackButton fallbackHref={detailHref} />
      </div>

      <div className="desktop-player-stage relative mx-auto flex min-h-[calc(100vh-104px)] max-w-[1180px] items-center">
        <div className="w-full overflow-hidden rounded-[12px] border border-[rgb(var(--accent-rgb)/0.24)] bg-[color:var(--bg-elevated)] shadow-[0_24px_72px_rgba(0,0,0,0.52)]">
          <header className="flex items-center justify-between gap-4 border-b border-white/5 bg-[rgba(18,19,22,0.94)] px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="player-live-dot h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--accent)] shadow-[0_0_14px_rgb(var(--accent-rgb)/0.5)]" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-white">
                  正在播放:{" "}
                  <span className="font-semibold text-[color:var(--accent)]">
                    {animeTitle}
                  </span>
                </p>
              </div>
              <span
                data-tabular
                className="hidden rounded-[6px] bg-[rgb(var(--accent-rgb)/0.12)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--accent)] sm:inline-flex"
              >
                {episodeHeading}
              </span>
              <span
                data-tabular
                className={cn(
                  "hidden rounded-[6px] border border-white/8 bg-white/[0.045] px-2 py-0.5 font-mono text-[10px] font-semibold sm:inline-flex",
                  completed
                    ? "text-[color:var(--status-success)]"
                    : saving
                      ? "text-[color:var(--accent)]"
                      : "text-white/55",
                )}
              >
                {progressPercent}%
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                leftIcon={<Info size={13} />}
                className="text-white/55 hover:text-white"
              >
                <a href={detailHref}>详情页</a>
              </Button>
              {canOpenExternalPlayer && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leftIcon={
                    externalPending ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <ExternalLink size={13} />
                    )
                  }
                  onClick={openExternalPlayer}
                  disabled={externalPending}
                >
                  外部播放器
                </Button>
              )}
            </div>
          </header>

          <div
            ref={theaterRef}
            className={cn(
              "group/theater relative aspect-video w-full overflow-hidden bg-black",
              isTheaterFullscreen && !controlsVisible && "cursor-none",
            )}
            onMouseMove={revealControls}
            onPointerDown={revealControls}
            onTouchStart={revealControls}
            onFocusCapture={revealControls}
          >
            <video
              ref={videoRef}
              className="h-full w-full bg-black object-contain"
              src={videoSource}
              poster={shouldShowVideoPoster ? coverUrl ?? undefined : undefined}
              preload="metadata"
              playsInline
              onClick={() => void togglePlayback()}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => {
                setIsPlaying(false);
                void saveProgress(true);
              }}
              onEnded={handleEnded}
              onError={() => void handleVideoError()}
            >
              {subtitlesEnabled && selectedSubtitleUrl && (
                <track
                  key={selectedSubtitleUrl}
                  kind="subtitles"
                  src={selectedSubtitleUrl}
                  srcLang="zh"
                  label={
                    subtitleTracks.find((track) => track.url === selectedSubtitleUrl)
                      ?.label ?? "外挂字幕"
                  }
                  default
                />
              )}
            </video>

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgb(var(--accent-rgb)/0.1)] to-transparent" />

            {!isPlaying && !videoError && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <button
                  type="button"
                  onClick={() => void togglePlayback()}
                  aria-label="播放"
                  className="player-center-control player-primary-control inline-flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--accent)] text-[color:var(--accent-contrast)] focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
                >
                  <Play size={16} className="translate-x-[1px] fill-current" />
                </button>
              </div>
            )}

            {videoError && (
              <div className="absolute inset-x-4 top-4 rounded-[8px] border border-[rgba(239,68,68,0.28)] bg-[rgba(18,18,20,0.92)] p-3 text-[12px] text-white backdrop-blur-[14px]">
                <div className="flex items-start gap-2">
                  <AlertCircle
                    size={15}
                    className="mt-0.5 shrink-0 text-[color:var(--status-error)]"
                  />
                  <div className="min-w-0 flex-1">
                    <span>{videoError}</span>
                    {(videoErrorKind === "decode" ||
                      (videoErrorKind === "playback" &&
                        playbackMode === "compatible")) &&
                      nativeHlsSupported && (
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center gap-1.5 rounded-[6px] bg-[color:var(--accent)] px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--accent-contrast)] disabled:cursor-wait disabled:opacity-60"
                          onClick={() => void startCompatiblePlayback()}
                          disabled={compatiblePending}
                        >
                          {compatiblePending && (
                            <Loader2 size={12} className="animate-spin" />
                          )}
                          {compatiblePending ? "正在准备" : "兼容播放"}
                        </button>
                      )}
                  </div>
                </div>
              </div>
            )}

            {autoPlayCountdown !== null && nextPlayableEpisode && (
              <div className="absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-[8px] border border-[color:var(--accent-muted)] bg-black/72 px-4 py-3 text-[12px] text-white shadow-[0_18px_50px_rgba(0,0,0,0.4)] backdrop-blur-[16px]">
                <span data-tabular>
                  {autoPlayCountdown}s 后播放 EP.
                  {String(nextPlayableEpisode).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  onClick={() => void navigateToEpisode(nextPlayableEpisode, true)}
                  className="rounded-[6px] bg-[color:var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--accent-contrast)]"
                >
                  立即播放
                </button>
                <button
                  type="button"
                  onClick={() => setAutoPlayCountdown(null)}
                  aria-label="取消自动连播"
                  className="text-white/55 transition-colors hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {episodePanelMounted && (
              <div className="absolute inset-0 z-30">
                <button
                  type="button"
                  aria-label="关闭选集遮罩"
                  data-open={episodePanelOpen ? "true" : "false"}
                  className="t-panel-scrim absolute inset-0 cursor-default bg-black/28 backdrop-blur-[2px]"
                  onClick={closeEpisodePanel}
                />
                <aside
                  data-open={episodePanelOpen ? "true" : "false"}
                  className="t-panel-slide player-episode-panel absolute inset-y-0 right-0 flex h-full w-full max-w-[380px] flex-col border-l border-white/10 bg-[rgba(18,19,22,0.94)] shadow-[0_24px_72px_rgba(0,0,0,0.5)] backdrop-blur-[20px]"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-white">选集</p>
                      <p className="mt-0.5 text-[11px] text-white/42">
                        仅显示已下载集可直接播放
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeEpisodePanel}
                      aria-label="关闭选集"
                      className="flex h-8 w-8 items-center justify-center rounded-[6px] text-white/55 transition-colors hover:bg-white/8 hover:text-white"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                    {playerEpisodes.map((episode) => (
                      <button
                        key={episode.id}
                        type="button"
                        disabled={!episode.isPlayable}
                        onClick={() => {
                          closeEpisodePanel();
                          void navigateToEpisode(episode.number);
                        }}
                        className={cn(
                          "w-full rounded-[8px] border px-3 py-2.5 text-left transition-[background,border-color,opacity] duration-150",
                          episode.number === episodeNumber
                            ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]"
                            : "border-white/8 bg-white/[0.035] hover:border-white/16 hover:bg-white/[0.06]",
                          !episode.isPlayable && "cursor-not-allowed opacity-42",
                        )}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 text-[12px] font-semibold text-white">
                              {episode.number === episodeNumber && (
                                <span className="player-live-dot h-2 w-2 shrink-0 rounded-full bg-[color:var(--accent)]" />
                              )}
                              EP.{String(episode.number).padStart(2, "0")}
                            </span>
                            <span className="mt-1 block truncate text-[11px] text-white/45">
                              {episode.title ?? "未命名剧集"}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                              episode.isPlayable
                                ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
                                : "bg-white/6 text-white/35",
                            )}
                          >
                            {episode.isPlayable ? "可播放" : "未下载"}
                          </span>
                        </span>
                        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/12">
                          <span
                            className="block h-full rounded-full bg-[color:var(--accent)]"
                            style={{
                              width: `${getEpisodeProgressPercent(episode)}%`,
                            }}
                          />
                        </span>
                        <span className="mt-1.5 flex items-center justify-between text-[10px] text-white/35">
                          <span>{episodeStatusLabel(episode)}</span>
                          <span data-tabular>
                            {getEpisodeProgressPercent(episode)}%
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </aside>
              </div>
            )}

            <div
              className={cn(
                "absolute inset-x-0 bottom-0 space-y-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-5 transition-[opacity,transform] duration-300",
                controlsVisible
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-full opacity-0",
              )}
              onFocusCapture={() => {
                setControlsFocused(true);
                revealControls();
              }}
              onBlurCapture={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget as Node | null)
                ) {
                  setControlsFocused(false);
                }
              }}
            >
              <div className="space-y-1.5">
                <div
                  data-tabular
                  className="flex items-center justify-between text-[11px] font-mono text-white/55"
                >
                  <span>{formatTime(position)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="relative h-3">
                  <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-150"
                      style={{ width: `${progressRatio * 100}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={seekMax}
                    step={1}
                    value={seekValue}
                    onChange={(event) =>
                      handleSeekChange(Number(event.currentTarget.value))
                    }
                    aria-label="调整播放进度"
                    className="player-seek-range absolute inset-0 h-3 w-full cursor-pointer appearance-none bg-transparent"
                  />
                </div>
              </div>

              {settingsPanelOpen && (
                <>
                  <button
                    type="button"
                    aria-label="关闭播放设置遮罩"
                    className="fixed inset-0 z-10 cursor-default bg-transparent"
                    onClick={() => setSettingsPanelOpen(false)}
                  />
                  <div
                    data-origin="bottom-right"
                    className="t-dropdown is-open absolute bottom-[88px] right-5 z-20 w-[min(360px,calc(100vw-40px))] rounded-[8px] border border-white/10 bg-[rgba(18,19,22,0.94)] p-3 text-[12px] text-white shadow-[0_18px_52px_rgba(0,0,0,0.42)] backdrop-blur-[18px]"
                    onClick={(event) => event.stopPropagation()}
                  >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-semibold">播放设置</span>
                    <button
                      type="button"
                      onClick={() => setSettingsPanelOpen(false)}
                      aria-label="关闭播放设置"
                      className="text-white/45 transition-colors hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-[6px] bg-white/[0.035] px-3 py-2">
                      <span className="text-white/68">自动连播</span>
                      <button
                        type="button"
                        onClick={() => setAutoPlayEnabled((value) => !value)}
                        className={cn(
                          "h-5 w-9 rounded-full p-0.5 transition-colors",
                          autoPlayEnabled
                            ? "bg-[color:var(--accent)]"
                            : "bg-white/16",
                        )}
                        aria-pressed={autoPlayEnabled}
                      >
                        <span
                          className={cn(
                            "block h-4 w-4 rounded-full bg-white transition-transform",
                            autoPlayEnabled && "translate-x-4",
                          )}
                        />
                      </button>
                    </div>

                    <div>
                      <p className="mb-2 text-[11px] text-white/42">倍速</p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {PLAYBACK_RATES.map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => changePlaybackRate(rate)}
                            className={cn(
                              "rounded-[6px] border px-2 py-1.5 text-[11px] transition-colors",
                              playbackRate === rate
                                ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
                                : "border-white/10 bg-white/[0.035] text-white/58 hover:border-white/16 hover:text-white",
                            )}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[11px] text-white/42">外挂字幕</p>
                        <button
                          type="button"
                          onClick={() => setSubtitlesEnabled((value) => !value)}
                          disabled={subtitleTracks.length === 0}
                          className="text-[11px] text-[color:var(--accent)] disabled:text-white/25"
                        >
                          {subtitlesEnabled ? "关闭" : "开启"}
                        </button>
                      </div>
                      <div className="space-y-1">
                        {subtitleTracks.length === 0 ? (
                          <p className="rounded-[6px] bg-white/[0.035] px-3 py-2 text-[11px] text-white/35">
                            未发现同目录 .vtt / .srt 字幕
                          </p>
                        ) : (
                          subtitleTracks.map((track) => (
                            <button
                              key={track.url}
                              type="button"
                              onClick={() => {
                                setSelectedSubtitleUrl(track.url);
                                setSubtitlesEnabled(true);
                              }}
                              className="flex w-full items-center justify-between rounded-[6px] bg-white/[0.035] px-3 py-2 text-left text-[11px] text-white/62 transition-colors hover:bg-white/[0.07] hover:text-white"
                            >
                              <span className="truncate">{track.label}</span>
                              {selectedSubtitleUrl === track.url && subtitlesEnabled && (
                                <Check
                                  size={13}
                                  className="text-[color:var(--accent)]"
                                />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                  </div>
                </>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => void togglePlayback()}
                    aria-label={isPlaying ? "暂停" : "播放"}
                    className="flex h-6 w-6 items-center justify-center text-white transition-colors hover:text-white/80 active:text-white/65"
                  >
                    <IconSwap
                      state={isPlaying ? "b" : "a"}
                      iconA={
                        <Play
                          size={17}
                          className="translate-x-[1px] fill-current"
                        />
                      }
                      iconB={<Pause size={17} className="fill-current" />}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => void navigateToEpisode(previousPlayableEpisode)}
                    disabled={!previousPlayableEpisode}
                    aria-label="上一集"
                    className="flex h-7 w-7 items-center justify-center rounded-[6px] text-white/75 transition-colors hover:bg-white/8 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  >
                    <StepBack size={16} className="fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void navigateToEpisode(nextPlayableEpisode)}
                    disabled={!nextPlayableEpisode}
                    aria-label="下一集"
                    className="flex h-7 w-7 items-center justify-center rounded-[6px] text-white/75 transition-colors hover:bg-white/8 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  >
                    <StepForward size={16} className="fill-current" />
                  </button>

                  <div className="hidden items-center gap-2 sm:flex">
                    <button
                      type="button"
                      onClick={toggleMute}
                      aria-label={muted ? "取消静音" : "静音"}
                      className="text-white/85 transition-colors hover:text-white"
                    >
                      <IconSwap
                        state={muted || volume === 0 ? "b" : "a"}
                        iconA={<Volume2 size={16} />}
                        iconB={<VolumeX size={16} />}
                      />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={muted ? 0 : volume}
                      onChange={(event) =>
                        handleVolumeChange(Number(event.currentTarget.value))
                      }
                      aria-label="调整音量"
                      style={volumeStyle}
                      className="player-volume-range h-1 w-20 cursor-pointer appearance-none rounded-full"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openEpisodePanel}
                    aria-label="打开选集"
                    className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11px] font-medium text-white/72 transition-colors hover:bg-white/8 hover:text-white"
                  >
                    <ListVideo size={15} />
                    <span className="hidden sm:inline">选集</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeEpisodePanel();
                      setSettingsPanelOpen((value) => !value);
                    }}
                    aria-label="播放设置"
                    className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11px] font-medium text-white/72 transition-colors hover:bg-white/8 hover:text-white"
                  >
                    <Gauge size={15} />
                    <span data-tabular>{playbackRate}x</span>
                  </button>
                  <IconTooltip
                    label={
                      subtitleTracks.length === 0
                        ? "未发现字幕"
                        : subtitlesEnabled
                          ? "关闭字幕"
                          : "开启字幕"
                    }
                    className="hidden sm:inline-flex"
                  >
                    <button
                      type="button"
                      onClick={() => setSubtitlesEnabled((value) => !value)}
                      disabled={subtitleTracks.length === 0}
                      aria-label={subtitlesEnabled ? "关闭字幕" : "开启字幕"}
                      className={cn(
                        "t-tt-trigger flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors",
                        subtitlesEnabled
                          ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
                          : "text-white/72 hover:bg-white/8 hover:text-white",
                        subtitleTracks.length === 0 &&
                          "pointer-events-none opacity-30",
                      )}
                    >
                      <Captions size={15} />
                    </button>
                  </IconTooltip>
                  <IconTooltip label="截图当前画面" className="hidden sm:inline-flex">
                    <button
                      type="button"
                      onClick={captureScreenshot}
                      aria-label="截图"
                      className="t-tt-trigger flex h-7 w-7 items-center justify-center rounded-[6px] text-white/72 transition-colors hover:bg-white/8 hover:text-white"
                    >
                      <Camera size={15} />
                    </button>
                  </IconTooltip>
                  <IconTooltip label="进入全屏" className="inline-flex">
                    <button
                      type="button"
                      onClick={() => void requestTheaterFullscreen()}
                      aria-label="全屏"
                      className="t-tt-trigger flex h-7 w-7 items-center justify-center rounded-[6px] text-white/72 transition-colors hover:bg-white/8 hover:text-white"
                    >
                      <Maximize size={17} />
                    </button>
                  </IconTooltip>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

function IconTooltip({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("t-tt-wrap player-control-tooltip", className)}>
      {children}
      <span className="t-tt player-control-tooltip-bubble" role="tooltip">
        {label}
      </span>
    </span>
  );
}

function getEpisodeProgressPercent(episode: PlayerEpisodeItem) {
  if (episode.playbackDurationSeconds <= 0) {
    return episode.playbackCompleted || episode.isWatched ? 100 : 0;
  }
  return Math.round(
    Math.min(1, episode.playbackPositionSeconds / episode.playbackDurationSeconds) *
      100,
  );
}

function episodeStatusLabel(episode: PlayerEpisodeItem) {
  if (episode.playbackCompleted) return "已记录";
  if (episode.isTrackingCurrent) return "追看到这里";
  if (episode.isWatched) return "已看";
  if (episode.playbackPositionSeconds > 0) {
    return `${formatTime(episode.playbackPositionSeconds)} / ${formatTime(
      episode.playbackDurationSeconds,
    )}`;
  }
  return episode.isPlayable ? "未播放" : "等待下载";
}

function readStoredNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const value = raw == null ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function writeStoredNumber(key: string, value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function writeStoredBoolean(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value ? "true" : "false");
}

function readRootDurationMs(name: string, fallbackMs: number) {
  if (typeof window === "undefined") return fallbackMs;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!raw) return fallbackMs;
  const match = /^([\d.]+)(ms|s)$/.exec(raw);
  if (!match) return fallbackMs;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return fallbackMs;
  return match[2] === "s" ? value * 1000 : value;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    !!target.closest("[role='menu'],[role='dialog']")
  );
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
