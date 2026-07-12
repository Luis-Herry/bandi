function formatBinaryValue(
  value: number | null | undefined,
  units: readonly string[],
): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  if (value === 0) return `0 ${units[0]}`;

  let next = value;
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit += 1;
  }
  return `${next.toFixed(next >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatTransferSpeed(value: number | null | undefined): string {
  return formatBinaryValue(value, ["B/s", "KB/s", "MB/s", "GB/s"]);
}

export function formatDataSize(value: number | null | undefined): string {
  return formatBinaryValue(value, ["B", "KB", "MB", "GB", "TB"]);
}
