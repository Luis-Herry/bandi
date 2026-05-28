/**
 * 一次性清理脚本：清空 downloadQueue 表。
 *
 * 触发场景：RSS 误抓导致海量种子入库时。
 * 不影响 anime / userAnime / episodes / rssSources。
 *
 * 跑法：`npx tsx scripts/clear-queue.ts`
 */
import Database from "better-sqlite3";

const dbPath = "./data/anime.db";
const db = new Database(dbPath);

const before = db.prepare("SELECT COUNT(*) AS c FROM download_queue").get() as {
  c: number;
};
console.log(`[clear-queue] before: ${before.c} rows`);

const r = db.prepare("DELETE FROM download_queue").run();
console.log(`[clear-queue] deleted ${r.changes} rows`);

const after = db.prepare("SELECT COUNT(*) AS c FROM download_queue").get() as {
  c: number;
};
console.log(`[clear-queue] after: ${after.c} rows`);

db.close();
