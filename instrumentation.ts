/**
 * Next.js instrumentation hook — runs once at server start.
 * 这里启动 node-cron 调度。仅在 Node runtime 下注册（Edge 没有 fs/sqlite）。
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 动态 import 避免把 cron / better-sqlite3 拽到 edge bundle 里
  const { startCronJobs } = await import("@/lib/cron");
  startCronJobs();
}
