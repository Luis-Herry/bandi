"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  decaySpeed: number;
  tone: number;
}

const PARTICLE_COUNT = 65;

export function EmberBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let accent = readAccentRgb();
    let colorRefreshAt = performance.now();

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const particles: Particle[] = [];
    const createParticle = (initial = false): Particle => ({
      x: Math.random() * width,
      y: initial ? Math.random() * height : height + Math.random() * 40,
      size: Math.random() * 3.2 + 0.8,
      speedX: (Math.random() - 0.5) * 0.8 - 0.15,
      speedY: -Math.random() * 1.45 - 0.35,
      opacity: Math.random() * 0.55 + 0.18,
      decaySpeed: Math.random() * 0.0028 + 0.001,
      tone: Math.random(),
    });

    resize();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(true));
    }

    const animate = (now: number) => {
      if (now - colorRefreshAt > 500) {
        colorRefreshAt = now;
        accent = readAccentRgb();
      }

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createRadialGradient(
        width / 2,
        height / 2,
        10,
        width / 2,
        height / 2,
        Math.max(width, height),
      );
      bg.addColorStop(0, "rgba(10, 10, 11, 0.24)");
      bg.addColorStop(1, "rgba(4, 5, 6, 0.5)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y += p.speedY;
        p.x += p.speedX;
        p.opacity -= p.decaySpeed;

        if (p.y < -20 || p.x < -20 || p.x > width + 20 || p.opacity <= 0) {
          particles[i] = createParticle(false);
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = rgbaForParticle(accent, p.tone, p.opacity);
        ctx.shadowBlur = p.size * 2.4;
        ctx.shadowColor = rgbaForParticle(accent, 0.7, 0.55);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      frame = window.requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resize);
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-70"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

function readAccentRgb() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent-rgb")
    .trim();
  const [r, g, b] = raw.split(/\s+/).map(Number);
  if ([r, g, b].some(Number.isNaN)) return { r: 212, g: 168, b: 83 };
  return { r, g, b };
}

function rgbaForParticle(
  color: { r: number; g: number; b: number },
  tone: number,
  alpha: number,
) {
  const lift = 0.12 + tone * 0.22;
  const r = Math.round(color.r + (255 - color.r) * lift);
  const g = Math.round(color.g + (255 - color.g) * lift);
  const b = Math.round(color.b + (255 - color.b) * lift);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
