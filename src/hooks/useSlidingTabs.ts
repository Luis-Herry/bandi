"use client";

import { useEffect, useRef, type DependencyList } from "react";

function getActiveTab(root: HTMLElement) {
  return (
    root.querySelector<HTMLElement>('.t-tab[aria-selected="true"]') ??
    root.querySelector<HTMLElement>(".t-tab[data-state='active']") ??
    root.querySelector<HTMLElement>(".t-tab")
  );
}

function movePill(root: HTMLElement, animate: boolean) {
  const pill = root.querySelector<HTMLElement>(".t-tabs-pill");
  const tab = getActiveTab(root);
  if (!pill || !tab) return;

  const variant = root.dataset.tabsVariant;
  const x = tab.offsetLeft;
  const y = variant === "line" ? 0 : tab.offsetTop;
  const width = tab.offsetWidth;
  const height = tab.offsetHeight;
  const transform =
    variant === "line"
      ? `translateX(${x}px)`
      : `translate3d(${x}px, ${y}px, 0)`;

  const apply = () => {
    pill.style.transform = transform;
    pill.style.width = `${width}px`;
    if (variant !== "line") pill.style.height = `${height}px`;
  };

  if (animate) {
    apply();
    return;
  }

  const prevTransition = pill.style.transition;
  pill.style.transition = "none";
  apply();
  void pill.offsetWidth;
  pill.style.transition = prevTransition;
}

export function useSlidingTabs<T extends HTMLElement = HTMLDivElement>(
  deps: DependencyList = [],
) {
  const ref = useRef<T | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let frame = window.requestAnimationFrame(() => {
      movePill(root, readyRef.current);
      readyRef.current = true;
    });

    const snap = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => movePill(root, false));
    };

    const ResizeObserverCtor = window.ResizeObserver;
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserverCtor === "function") {
      resizeObserver = new ResizeObserverCtor(snap);
      resizeObserver.observe(root);
      root
        .querySelectorAll<HTMLElement>(".t-tab")
        .forEach((tab) => resizeObserver?.observe(tab));
    } else {
      window.addEventListener("resize", snap);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", snap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
