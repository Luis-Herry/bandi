/**
 * 一次性清理脚本：清空所有番剧相关测试数据。
 *
 * 清空：episodes / user_anime / anime / download_queue
 * 保留：users / app_settings / rss_sources
 *
 * 跑法：`npx tsx scripts/clear-fake-data.ts`
 */
import Database from "better-sqlite3";

const dbPath = "./data/anime.db";
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

function count(table: string): number {
  const r = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as {
    c: number;
  };
  return r.c;
}

const TABLES = ["episodes", "user_anime", "anime", "download_queue"] as const;

console.log("[clear-fake-data] before:");
for (const t of TABLES) console.log(`  ${t.padEnd(16)} ${count(t)}`);

const tx = db.transaction(() => {
  for (const t of TABLES) {
    const r = db.prepare(`DELETE FROM ${t}`).run();
    console.log(`[clear-fake-data] DELETE ${t.padEnd(16)} -> ${r.changes}`);
  }
  // 自增 ID 重置（可选，让新插入从 1 开始）
  db.prepare(
    `DELETE FROM sqlite_sequence WHERE name IN ('episodes','user_anime','anime','download_queue')`,
  ).run();
});
tx();

console.log("[clear-fake-data] after:");
for (const t of TABLES) console.log(`  ${t.padEnd(16)} ${count(t)}`);

db.close();
