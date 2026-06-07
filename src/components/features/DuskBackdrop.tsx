"use client";

import { useEffect, useRef, useState } from "react";

const SCENE_ONE_SRC = "/media/login-scene-1.mp4";
const SCENE_TWO_SRC = "/media/login-scene-2.mp4";
const SCENE_THREE_SRC = "/media/login-scene-3.mp4";
const CROSSFADE_SECONDS = 0.55;
const CROSSFADE_MS = 700;
const SCENE_TWO_AUDIO_FADE_SECONDS = 0.7;
const IDLE_RETRY_MS = 500;

type LayerIndex = 0 | 1;
type LoginScene = "idle" | "sequence" | "hold" | "failed";

interface DuskBackdropProps {
  onReveal?: () => void;
}

export function DuskBackdrop({ onReveal }: DuskBackdropProps) {
  const idleVideoRefs = useRef<Array<HTMLVideoElement | null>>([null, null]);
  const sequenceVideoRef = useRef<HTMLVideoElement>(null);
  const holdVideoRef = useRef<HTMLVideoElement>(null);
  const onRevealRef = useRef(onReveal);
  const revealedRef = useRef(false);
  const idleLayerRef = useRef<LayerIndex>(0);
  const sceneRef = useRef<LoginScene>("idle");
  const idleTransitioningRef = useRef(false);
  const idleRetryRef = useRef<number | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  onRevealRef.current = onReveal;

  const [idleLayer, setIdleLayer] = useState<LayerIndex>(0);
  const [scene, setScene] = useState<LoginScene>("idle");

  const setSceneState = (nextScene: LoginScene) => {
    sceneRef.current = nextScene;
    setScene(nextScene);
  };

  const reveal = () => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    onRevealRef.current?.();
  };

  const clearTimer = (timer: number) => {
    window.clearTimeout(timer);
    timersRef.current = timersRef.current.filter((item) => item !== timer);
  };

  const queueTimer = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      clearTimer(timer);
      callback();
    }, delay);
    timersRef.current.push(timer);
  };

  const stopSceneTwoAudioFade = () => {
    if (audioFrameRef.current === null) return;
    window.cancelAnimationFrame(audioFrameRef.current);
    audioFrameRef.current = null;
  };

  const clearTimers = () => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }
    timersRef.current = [];
    if (idleRetryRef.current !== null) {
      window.clearInterval(idleRetryRef.current);
      idleRetryRef.current = null;
    }
    stopSceneTwoAudioFade();
  };

  const playVideo = async (
    video: HTMLVideoElement,
    {
      muted,
      restart = true,
      volume = muted ? 0 : 1,
    }: { muted: boolean; restart?: boolean; volume?: number },
  ) => {
    video.muted = muted;
    video.defaultMuted = muted;
    video.volume = volume;
    if (restart) {
      try {
        video.currentTime = 0;
      } catch {
        /* metadata may still be loading */
      }
    }
    try {
      await video.play();
      return true;
    } catch {
      return false;
    }
  };

  const applySceneTwoVolume = (video: HTMLVideoElement) => {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      video.volume = 0;
      return;
    }
    const fadeIn = Math.min(1, video.currentTime / SCENE_TWO_AUDIO_FADE_SECONDS);
    const fadeOut = Math.min(
      1,
      Math.max(0, duration - video.currentTime) / SCENE_TWO_AUDIO_FADE_SECONDS,
    );
    video.volume = Math.max(0, Math.min(1, fadeIn, fadeOut));
  };

  const startSceneTwoAudioFade = (video: HTMLVideoElement) => {
    stopSceneTwoAudioFade();
    const tick = () => {
      if (sceneRef.current !== "sequence" || video.paused) {
        stopSceneTwoAudioFade();
        return;
      }
      applySceneTwoVolume(video);
      audioFrameRef.current = window.requestAnimationFrame(tick);
    };
    applySceneTwoVolume(video);
    audioFrameRef.current = window.requestAnimationFrame(tick);
  };

  const crossfadeIdleLoop = async () => {
    if (sceneRef.current !== "idle" || idleTransitioningRef.current) return;
    idleTransitioningRef.current = true;
    const currentLayer = idleLayerRef.current;
    const nextLayer = (currentLayer === 0 ? 1 : 0) as LayerIndex;
    const currentVideo = idleVideoRefs.current[currentLayer];
    const nextVideo = idleVideoRefs.current[nextLayer];
    if (!nextVideo) {
      idleTransitioningRef.current = false;
      return;
    }
    const didPlay = await playVideo(nextVideo, { muted: true, volume: 0 });
    if (!didPlay) {
      idleTransitioningRef.current = false;
      return;
    }
    idleLayerRef.current = nextLayer;
    setIdleLayer(nextLayer);
    queueTimer(() => {
      currentVideo?.pause();
      idleTransitioningRef.current = false;
    }, CROSSFADE_MS);
  };

  const playHoldScene = async () => {
    stopSceneTwoAudioFade();
    const sequenceVideo = sequenceVideoRef.current;
    const holdVideo = holdVideoRef.current;
    if (!holdVideo) {
      setSceneState("failed");
      reveal();
      return;
    }
    const didPlay = await playVideo(holdVideo, { muted: true, volume: 0 });
    setSceneState(didPlay ? "hold" : "failed");
    reveal();
    queueTimer(() => {
      sequenceVideo?.pause();
    }, CROSSFADE_MS);
  };

  const activateSequence = () => {
    if (sceneRef.current !== "idle") return;
    const sequenceVideo = sequenceVideoRef.current;
    if (!sequenceVideo) return;
    clearTimers();
    void (async () => {
      sequenceVideo.muted = false;
      sequenceVideo.defaultMuted = false;
      const didPlay = await playVideo(sequenceVideo, {
        muted: false,
        volume: 0,
      });
      if (!didPlay) {
        await playHoldScene();
        return;
      }
      setSceneState("sequence");
      startSceneTwoAudioFade(sequenceVideo);
      queueTimer(() => {
        for (const video of idleVideoRefs.current) video?.pause();
      }, CROSSFADE_MS);
    })();
  };

  useEffect(() => {
    const idleVideos = idleVideoRefs.current.filter(
      Boolean,
    ) as HTMLVideoElement[];
    const sequenceVideo = sequenceVideoRef.current;
    const holdVideo = holdVideoRef.current;
    if (idleVideos.length < 2 || !sequenceVideo || !holdVideo) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) {
      holdVideo.pause();
      setSceneState("hold");
      reveal();
      return clearTimers;
    }

    const onIdleTime = (event: Event) => {
      const video = event.currentTarget as HTMLVideoElement;
      if (video !== idleVideoRefs.current[idleLayerRef.current]) return;
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= CROSSFADE_SECONDS) return;
      if (duration - video.currentTime <= CROSSFADE_SECONDS) {
        void crossfadeIdleLoop();
      }
    };

    const onIdleEnded = (event: Event) => {
      const video = event.currentTarget as HTMLVideoElement;
      if (video !== idleVideoRefs.current[idleLayerRef.current]) return;
      void crossfadeIdleLoop();
    };

    const onSequenceTime = () => {
      if (sceneRef.current === "sequence") applySceneTwoVolume(sequenceVideo);
    };

    const onSequenceEnded = () => {
      void playHoldScene();
    };

    const onHoldError = () => {
      setSceneState("failed");
      reveal();
    };

    for (const video of idleVideos) {
      video.addEventListener("timeupdate", onIdleTime);
      video.addEventListener("ended", onIdleEnded);
    }
    sequenceVideo.addEventListener("timeupdate", onSequenceTime);
    sequenceVideo.addEventListener("ended", onSequenceEnded);
    holdVideo.addEventListener("error", onHoldError);

    void playVideo(idleVideos[0], {
      muted: true,
      restart: false,
      volume: 0,
    });
    idleRetryRef.current = window.setInterval(() => {
      if (sceneRef.current !== "idle") return;
      const activeVideo = idleVideoRefs.current[idleLayerRef.current];
      if (activeVideo?.paused) {
        void playVideo(activeVideo, {
          muted: true,
          restart: false,
          volume: 0,
        });
      }
    }, IDLE_RETRY_MS);

    return () => {
      for (const video of idleVideos) {
        video.removeEventListener("timeupdate", onIdleTime);
        video.removeEventListener("ended", onIdleEnded);
      }
      sequenceVideo.removeEventListener("timeupdate", onSequenceTime);
      sequenceVideo.removeEventListener("ended", onSequenceEnded);
      holdVideo.removeEventListener("error", onHoldError);
      clearTimers();
    };
  }, []);

  const videoTransition = `opacity ${CROSSFADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[color:var(--bg-base)]">
      {scene !== "failed" && (
        <>
          <video
            aria-hidden
            ref={(node) => {
              idleVideoRefs.current[0] = node;
            }}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            src={SCENE_ONE_SRC}
            style={{
              opacity: scene === "idle" && idleLayer === 0 ? 1 : 0,
              transition: videoTransition,
            }}
            autoPlay
            muted
            playsInline
            preload="auto"
          />
          <video
            aria-hidden
            ref={(node) => {
              idleVideoRefs.current[1] = node;
            }}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            src={SCENE_ONE_SRC}
            style={{
              opacity: scene === "idle" && idleLayer === 1 ? 1 : 0,
              transition: videoTransition,
            }}
            muted
            playsInline
            preload="auto"
          />
          <video
            aria-hidden
            ref={sequenceVideoRef}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            src={SCENE_TWO_SRC}
            style={{
              opacity: scene === "sequence" ? 1 : 0,
              transition: videoTransition,
            }}
            playsInline
            preload="auto"
          />
          <video
            aria-hidden
            ref={holdVideoRef}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            src={SCENE_THREE_SRC}
            style={{
              opacity: scene === "hold" ? 1 : 0,
              transition: videoTransition,
            }}
            loop
            muted
            playsInline
            preload="auto"
          />
        </>
      )}
      {scene === "idle" && (
        <button
          type="button"
          aria-label="开始播放登录动画"
          onClick={activateSequence}
          className="absolute left-1/2 top-1/2 z-20 h-[clamp(96px,18vw,220px)] w-[clamp(96px,18vw,220px)] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full opacity-0"
        />
      )}
      {scene === "failed" && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 50%, rgb(var(--accent-rgb) / 0.16) 0%, transparent 62%), var(--bg-base)",
          }}
        />
      )}
    </div>
  );
}
