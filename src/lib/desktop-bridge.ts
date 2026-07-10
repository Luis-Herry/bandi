export function getDesktopBridge() {
  if (typeof window === "undefined") return null;
  return window.bandiDesktop ?? null;
}

export function formatStorageBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return "无法读取";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = unit >= 3 ? 1 : 0;
  return `${size.toFixed(digits)} ${units[unit]}`;
}
