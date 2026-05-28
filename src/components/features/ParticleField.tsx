"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { clampParticleCount } from "@/lib/particle-config";

interface ParticleFieldProps {
  count?: number;
  className?: string;
}

/**
 * Ambient particle field used as a layer behind the home hero.
 *
 * Performance budget: <200 particles, one Points draw call, no postprocessing.
 * Falls back to a CSS radial gradient when reduced motion is enabled or WebGL
 * cannot be created.
 */
export function ParticleField({ count = 140, className }: ParticleFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [webglEnabled, setWebglEnabled] = useState(false);
  const safeCount = clampParticleCount(count);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      setWebglEnabled(false);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
    } catch {
      setWebglEnabled(false);
      return;
    }

    setWebglEnabled(true);
    renderer.setClearAlpha(0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    root.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10);
    camera.position.z = 1;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(createPositions(safeCount), 3),
    );
    const color = new THREE.Color();
    const material = new THREE.PointsMaterial({
      color,
      size: 0.018,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const mouse = { x: 0, y: 0 };
    const onMove = (event: MouseEvent) => {
      mouse.x = (event.clientX / window.innerWidth - 0.5) * 0.4;
      mouse.y = (event.clientY / window.innerHeight - 0.5) * 0.4;
    };
    window.addEventListener("mousemove", onMove);

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);

    const refreshColor = () => {
      const rgbStr = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-rgb")
        .trim();
      if (!rgbStr) return;
      const [r, g, b] = rgbStr.split(/\s+/).map(Number);
      if ([r, g, b].some(Number.isNaN)) return;
      color.setRGB(r / 255, g / 255, b / 255);
      material.color.copy(color);
    };
    refreshColor();

    let frame = 0;
    let previous = performance.now();
    let colorRefreshAt = previous;
    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;

      points.rotation.y += dt * 0.03;
      points.rotation.x += dt * 0.012;
      points.position.x += (mouse.x - points.position.x) * 0.04;
      points.position.y += (-mouse.y - points.position.y) * 0.04;

      if (now - colorRefreshAt >= 500) {
        colorRefreshAt = now;
        refreshColor();
      }

      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", onMove);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [safeCount]);

  return (
    <div
      ref={rootRef}
      className={className}
      data-particle-count={safeCount}
      aria-hidden
      style={
        webglEnabled
          ? undefined
          : {
              background:
                "radial-gradient(ellipse at 50% 50%, rgb(var(--accent-rgb) / 0.08) 0%, transparent 60%)",
            }
      }
    />
  );
}

function createPositions(count: number): Float32Array {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const ring = i % 5;
    const spread = 1 + ring * 0.12;
    arr[i * 3] = (Math.random() - 0.5) * 2.4 * spread;
    arr[i * 3 + 1] = (Math.random() - 0.5) * 1.35;
    arr[i * 3 + 2] = (Math.random() - 0.5) * 0.9;
  }
  return arr;
}
