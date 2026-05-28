"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Star, Check } from "lucide-react";

/**
 * Demo 卡片：3:4 海报布局（同 BrowseCard）+ radesign-style-skeleton 的 1px conic
 * orbit ring + 复合悬浮（整卡上浮、封面放大、底部文字上滑、按钮浮入）。
 *
 * 自包含：所有 CSS 通过 <style jsx global> 内嵌，独立 class 前缀 `rad-`，和
 * 现有 `.anime-card-glow` 完全隔离。
 */

export interface DemoItem {
  id: number;
  title: string;
  subtitle: string;
  meta: string;
  cover: string;
  rating: number;
  /** 浮层左侧的小 tag，最多取前 2 个显示 */
  tags?: string[];
}

interface Props {
  items: DemoItem[];
}

export function OrbitCardDemo({ items }: Props) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState<Set<number>>(new Set());

  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".rad-card"));
    if (cards.length === 0) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;

    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && !reduceMotion) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target as HTMLElement;
            io?.unobserve(el);
            const idx = cards.indexOf(el);
            const delay = idx >= 0 ? Math.min(idx, 8) * 80 : 0;
            window.setTimeout(() => el.classList.add("is-revealed"), delay);
          });
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
      );
      cards.forEach((c) => io!.observe(c));
    } else {
      cards.forEach((c) => c.classList.add("is-revealed"));
    }

    const handlers: Array<{
      el: HTMLElement;
      onMove: (e: MouseEvent) => void;
      onLeave: () => void;
    }> = [];
    if (isFinePointer && !reduceMotion) {
      cards.forEach((el) => {
        const onMove = (e: MouseEvent) => {
          const r = el.getBoundingClientRect();
          el.style.setProperty(
            "--mx",
            `${((e.clientX - r.left) / r.width) * 100}%`,
          );
          el.style.setProperty(
            "--my",
            `${((e.clientY - r.top) / r.height) * 100}%`,
          );
        };
        const onLeave = () => {
          el.style.removeProperty("--mx");
          el.style.removeProperty("--my");
        };
        el.addEventListener("mousemove", onMove);
        el.addEventListener("mouseleave", onLeave);
        handlers.push({ el, onMove, onLeave });
      });
    }

    return () => {
      io?.disconnect();
      handlers.forEach(({ el, onMove, onLeave }) => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
      });
    };
  }, []);

  function handleAdd(id: number) {
    if (adding.has(id) || added.has(id)) return;
    setAdding((s) => new Set(s).add(id));
    window.setTimeout(() => {
      setAdded((s) => new Set(s).add(id));
      setAdding((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }, 600);
  }

  return (
    <>
      <div ref={gridRef} className="rad-grid">
        {items.map((it) => {
          const isAdding = adding.has(it.id);
          const isAdded = added.has(it.id);
          return (
            <article key={it.id} className="rad-card">
              {/* 封面 3:4，子图 hover 放大 */}
              <div className="rad-card__cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.cover} alt={it.title} />
              </div>

              {/* 上下渐变遮罩，保证标题 + 评分可读 */}
              <div className="rad-card__grad" aria-hidden />

              {/* 左上：评分 */}
              <div className="rad-card__rating">
                <Star
                  size={11}
                  className="rad-card__rating-icon"
                  fill="currentColor"
                />
                <span>{it.rating.toFixed(1)}</span>
              </div>

              {/* 右上：已收藏角标（演示） */}
              {isAdded && (
                <div className="rad-card__owned">
                  <Check size={10} strokeWidth={3} />
                  已收藏
                </div>
              )}

              {/* 底部文字（常态在卡底，hover 向上让位） */}
              <div className="rad-card__body">
                <div className="rad-card__meta">{it.meta}</div>
                <h3 className="rad-card__title">{it.title}</h3>
                {it.subtitle && (
                  <p className="rad-card__subtitle">{it.subtitle}</p>
                )}
              </div>

              {/* 底部浮层：左 tags + 右「想看」小按钮，常态下沉透明 */}
              <div className="rad-card__actions">
                <div className="rad-card__tags">
                  {(it.tags ?? []).slice(0, 2).map((t) => (
                    <span key={t} className="rad-card__tag">
                      {t}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="rad-card__btn"
                  onClick={() => handleAdd(it.id)}
                  disabled={isAdding || isAdded}
                >
                  {isAdded ? (
                    <>
                      <Check size={12} strokeWidth={2.8} />
                      已收藏
                    </>
                  ) : isAdding ? (
                    <>加入中…</>
                  ) : (
                    <>
                      <Plus size={12} strokeWidth={2.8} />
                      想看
                    </>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <style jsx global>{`
        @property --glow-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }

        .rad-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        /* —— host：position + isolation + 真 border + 3:4 海报，整体可点 */
        .rad-card {
          position: relative;
          isolation: isolate;
          aspect-ratio: 3 / 4;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          transition:
            transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 360ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 360ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .rad-card:hover {
          transform: translateY(-6px);
          border-color: rgba(255, 255, 255, 0.18);
          box-shadow:
            0 18px 40px -16px rgba(0, 0, 0, 0.55),
            0 8px 18px -8px rgba(0, 0, 0, 0.45);
        }

        /* —— 封面满铺，hover 时放大 */
        .rad-card__cover {
          position: absolute;
          inset: 0;
          overflow: hidden;
          background: var(--bg-elevated);
        }
        .rad-card__cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .rad-card:hover .rad-card__cover img {
          transform: scale(1.06);
        }

        /* —— 上下渐变遮罩 */
        .rad-card__grad {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.45) 0%,
            transparent 30%,
            transparent 45%,
            rgba(0, 0, 0, 0.55) 75%,
            rgba(0, 0, 0, 0.92) 100%
          );
        }

        /* —— 左上评分 */
        .rad-card__rating {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 5;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(6px);
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.95);
          font-variant-numeric: tabular-nums;
        }
        .rad-card__rating-icon {
          color: var(--accent);
        }

        /* —— 右上：已收藏 */
        .rad-card__owned {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 5;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px 6px;
          border-radius: 6px;
          background: var(--accent-muted);
          border: 1px solid rgb(var(--accent-rgb) / 0.4);
          backdrop-filter: blur(6px);
          font-size: 10px;
          font-weight: 600;
          color: var(--accent);
        }

        /* —— 底部文字块：常态贴底，hover 向上 -48px 给按钮腾位 */
        .rad-card__body {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 12px;
          z-index: 5;
          transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .rad-card:hover .rad-card__body {
          transform: translateY(-48px);
        }
        .rad-card__meta {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.75);
          font-variant-numeric: tabular-nums;
          margin-bottom: 4px;
          text-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
        }
        .rad-card__title {
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.005em;
          color: #fff;
          line-height: 1.25;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
        }
        .rad-card__subtitle {
          margin-top: 2px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.7);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
        }

        /* —— 底部浮层：左 tags + 右小按钮，常态下沉透明 */
        .rad-card__actions {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 12px;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          opacity: 0;
          transform: translateY(12px);
          pointer-events: none;
          transition:
            transform 500ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 380ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .rad-card:hover .rad-card__actions {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        /* tags：黑底半透明小标签 */
        .rad-card__tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          min-width: 0;
        }
        .rad-card__tag {
          display: inline-flex;
          align-items: center;
          height: 20px;
          padding: 0 6px;
          border-radius: 4px;
          font-size: 10px;
          line-height: 1;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.85);
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(6px);
          white-space: nowrap;
        }
        /* 想看按钮：右侧小按钮，不占满 */
        .rad-card__btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          height: 26px;
          padding: 0 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          color: #0a0a0a;
          background: var(--accent);
          border: 1px solid var(--accent);
          cursor: pointer;
          transition:
            transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
            background 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .rad-card__btn:hover {
          transform: translateY(-1px);
        }
        .rad-card__btn:active {
          transform: translateY(0) scale(0.98);
        }
        .rad-card__btn:disabled {
          opacity: 0.7;
          cursor: default;
          transform: none;
        }

        /* ====================================================================
           card--glow 同款：1px conic orbit ring（::before，一次性）+ 鼠标边缘
           描边（::after，hover 时显现）。padding + mask-composite 切出 1px ring。
           ==================================================================== */
        .rad-card::before,
        .rad-card::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          padding: 1px;
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          z-index: 6;
        }
        .rad-card::before {
          background: conic-gradient(
            from var(--glow-angle, 0deg),
            transparent 0deg,
            var(--accent) 24deg,
            transparent 64deg,
            transparent 360deg
          );
          opacity: 0;
        }
        @keyframes rad-card-orbit-once {
          0% {
            opacity: 0;
            --glow-angle: -10deg;
          }
          10% {
            opacity: 0.95;
            --glow-angle: 30deg;
          }
          85% {
            opacity: 0.95;
            --glow-angle: 320deg;
          }
          100% {
            opacity: 0;
            --glow-angle: 370deg;
          }
        }
        .rad-card.is-revealed::before {
          animation: rad-card-orbit-once 2.2s cubic-bezier(0.25, 0.7, 0.3, 1)
            forwards;
        }

        .rad-card::after {
          background: radial-gradient(
            180px circle at var(--mx, 50%) var(--my, 50%),
            rgb(var(--accent-rgb) / 1) 0%,
            rgb(var(--accent-rgb) / 0.55) 30%,
            transparent 65%
          );
          opacity: 0;
          transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .rad-card:hover::after {
          opacity: 1;
        }

        @media (prefers-reduced-motion: reduce) {
          .rad-card,
          .rad-card__cover img,
          .rad-card__body,
          .rad-card__actions {
            transition: none;
          }
          .rad-card:hover {
            transform: none;
          }
          .rad-card:hover .rad-card__cover img {
            transform: none;
          }
          .rad-card:hover .rad-card__body {
            transform: none;
          }
          .rad-card.is-revealed::before {
            animation: none;
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
