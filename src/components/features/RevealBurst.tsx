"use client";

/**
 * One-shot light burst played when the login card reveals: an expanding
 * ring wave plus a central cross flare, additively blended over the login
 * video (plus-lighter). Ported from the procedural magic-circle experiment
 * (login-magic-circle branch) — the only part of it that shipped.
 *
 * Colors are fixed amber to match the video asset, which is amber no matter
 * what UI theme is active.
 */

import { useEffect, useState } from "react";
import { motion } from "motion/react";

const LIFETIME_MS = 2400;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function RevealBurst() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDone(true), LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (done) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center overflow-hidden"
      style={{ mixBlendMode: "plus-lighter" }}
    >
      {/* 扩张光波环 */}
      <motion.div
        className="absolute h-[92vmin] w-[92vmin] rounded-full"
        style={{
          background:
            "radial-gradient(circle, transparent 55%, rgba(232, 196, 128, 0.55) 68%, rgba(212, 168, 83, 0.16) 78%, transparent 88%)",
        }}
        initial={{ scale: 0.28, opacity: 0 }}
        animate={{ scale: [0.28, 1, 1.52], opacity: [0, 0.9, 0] }}
        transition={{ duration: 1.7, ease: EASE_OUT, times: [0, 0.42, 1] }}
      />
      {/* 中央光斑 */}
      <motion.div
        className="absolute h-[54vmin] w-[54vmin] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255, 244, 214, 0.9) 0%, rgba(232, 196, 128, 0.42) 26%, rgba(212, 168, 83, 0.1) 55%, transparent 75%)",
        }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 1.05, 1, 0.96], opacity: [0, 0.95, 0.45, 0] }}
        transition={{ duration: 2.2, ease: "easeOut", times: [0, 0.3, 0.65, 1] }}
      />
      {/* 竖向耀斑 */}
      <motion.div
        className="absolute h-[58vmin] w-[7vmin]"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at center, rgba(255, 248, 228, 0.95) 0%, rgba(232, 196, 128, 0.35) 38%, transparent 70%)",
        }}
        initial={{ scaleY: 0.45, opacity: 0 }}
        animate={{ scaleY: [0.45, 1.1, 1, 0.9], opacity: [0, 0.9, 0.4, 0] }}
        transition={{ duration: 2.2, ease: "easeOut", times: [0, 0.3, 0.65, 1] }}
      />
      {/* 横向耀斑 */}
      <motion.div
        className="absolute h-[5vmin] w-[52vmin]"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at center, rgba(255, 248, 228, 0.9) 0%, rgba(232, 196, 128, 0.3) 38%, transparent 70%)",
        }}
        initial={{ scaleX: 0.5, opacity: 0 }}
        animate={{ scaleX: [0.5, 1.15, 1, 0.92], opacity: [0, 0.75, 0.3, 0] }}
        transition={{ duration: 2.2, ease: "easeOut", times: [0, 0.3, 0.65, 1] }}
      />
    </div>
  );
}
