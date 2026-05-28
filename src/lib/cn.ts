import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class strings safely. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
