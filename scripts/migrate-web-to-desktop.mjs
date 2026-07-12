import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const TABLES = [
  "users",
  "anime",
  "user_anime",
  "episodes",
  "watch_events",
  "playback_progress",
  "rss_sources",
  "app_settings",
  "download_queue",
];

export const EXPECTED_SOURCE_COUNTS = Object.freeze({
  users: 1,
  anime: 317,
  user_anime: 58,
  episodes: 1417,
  watch_events: 372,
  playback_progress: 5,
  rss_sources: 1,
  app_settings: 5,
  download_queue: 300,
});

export const EXPECTED_MIGRATED_COUNTS = Object.freeze({
  users: 1,
  anime: 316,
  user_anime: 58,
  episodes: 1417,
  watch_events: 372,
  playback_progress: 5,
  rss_sources: 1,
  app_settings: 4,
  download_queue: 297,
});

const EXPECTED_EMPTY_TARGET_TABLES = [
  "anime",
  "user_anime",
  "episodes",
  "watch_events",
  "playback_progress",
  "download_queue",
];

const SETTINGS_TO_MIGRATE = [
  "cinema_library",
  "download_preferences",
  "rss_title_aliases",
];

const ARCHIVED_DOWNLOAD_IDS = new Set([752, 755, 756]);

const QA_VERIFIED_DOUBAN_MAPPING = Object.freeze({
  source: "qa_verified_mapping",
  evidenceId: 63,
  canonicalId: 792,
  bangumiId: 569116,
  doubanId: "37425956",
  title: "碧蓝之海 第三季",
  titleJa: "ぐらんぶる Season 3",
  year: 2026,
  totalEpisodes: 12,
  rating: 8.6,
  fetchedAt: 1783806280,
  tags: ["喜剧", "动画"],
});

const RESOURCE_FILES = Object.freeze({
  grandBlue:
    "[ANi] GRAND BLUE 碧藍之海 3 - 01 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4",
  girlfriends:
    "[ANi] 超超超超超喜歡你的 100 個女朋友 - 25 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4",
  slime:
    "[ANi] 關於我轉生變成史萊姆這檔事 第四季 - 86 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4",
});

class MigrationError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "MigrationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new MigrationError(code, message, details);
}

function assertCondition(condition, code, message, details) {
  if (!condition) fail(code, message, details);
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function canonicalExistingPath(value) {
  const absolute = resolve(value);
  assertCondition(existsSync(absolute), "path_missing", `路径不存在：${absolute}`);
  return realpathSync.native(absolute);
}

function canonicalPathForComparison(value) {
  const absolute = resolve(value);
  return existsSync(absolute) ? realpathSync.native(absolute) : absolute;
}

function samePath(a, b) {
  return a.normalize("NFKC").toLowerCase() === b.normalize("NFKC").toLowerCase();
}

function assertDistinctDownloadPaths(sourcePath, targetPath) {
  assertCondition(
    !samePath(sourcePath, targetPath),
    "same_download_root",
    "源下载目录与目标下载目录不能指向同一位置",
    { sourcePath, targetPath },
  );
}

function readAutoincrementTableInfo(db) {
  return db
    .prepare(
      `select name
       from sqlite_master
       where type = 'table'
         and sql is not null
         and upper(sql) like '%AUTOINCREMENT%'
       order by name`,
    )
    .all()
    .map(({ name }) => {
      const primaryKey = db
        .prepare(`pragma table_info(${quoteIdentifier(name)})`)
        .all()
        .find((column) => Number(column.pk) === 1);
      assertCondition(
        primaryKey?.name,
        "autoincrement_primary_key_missing",
        `${name} 缺少可识别的 AUTOINCREMENT 主键`,
      );
      return { table: name, primaryKey: primaryKey.name };
    });
}

function readSqliteSequences(db, tables) {
  const stored = new Map(
    db
      .prepare("select name, seq from sqlite_sequence")
      .all()
      .map((row) => [row.name, Number(row.seq ?? 0)]),
  );
  return Object.fromEntries(
    tables.map(({ table }) => [table, stored.get(table) ?? 0]),
  );
}

function buildSequencePlan(sourceDb, targetDb) {
  const targetTables = readAutoincrementTableInfo(targetDb);
  const sourceTableNames = new Set(
    readAutoincrementTableInfo(sourceDb).map(({ table }) => table),
  );
  const missingSourceTables = targetTables
    .map(({ table }) => table)
    .filter((table) => !sourceTableNames.has(table));
  assertCondition(
    missingSourceTables.length === 0,
    "autoincrement_schema_mismatch",
    "Web 源库缺少 Desktop AUTOINCREMENT 表",
    missingSourceTables,
  );
  return {
    tables: targetTables,
    sourceBaseline: readSqliteSequences(sourceDb, targetTables),
    targetBaseline: readSqliteSequences(targetDb, targetTables),
  };
}

function readRows(db, table) {
  return db.prepare(`select * from ${quoteIdentifier(table)} order by rowid`).all();
}

function readCounts(db) {
  return Object.fromEntries(
    TABLES.map((table) => [
      table,
      Number(
        db.prepare(`select count(*) as count from ${quoteIdentifier(table)}`).get()
          .count,
      ),
    ]),
  );
}

function assertCounts(actual, expected, code, label) {
  const mismatches = Object.entries(expected)
    .filter(([table, count]) => actual[table] !== count)
    .map(([table, count]) => ({ table, expected: count, actual: actual[table] }));
  assertCondition(
    mismatches.length === 0,
    code,
    `${label}计数与一次性迁移快照不一致`,
    mismatches,
  );
}

function integrityResult(db) {
  return String(db.pragma("integrity_check", { simple: true }));
}

function foreignKeyViolations(db) {
  return db.pragma("foreign_key_check");
}

function assertDatabaseHealthy(db, label) {
  const integrity = integrityResult(db);
  const foreignKeys = foreignKeyViolations(db);
  assertCondition(
    integrity === "ok",
    "integrity_check_failed",
    `${label} integrity_check 失败`,
    integrity,
  );
  assertCondition(
    foreignKeys.length === 0,
    "foreign_key_check_failed",
    `${label} foreign_key_check 失败`,
    foreignKeys,
  );
  return { integrityCheck: integrity, foreignKeyCheck: foreignKeys };
}

function decodeLocalFile(value) {
  assertCondition(
    typeof value === "string" && value.startsWith("local-file:"),
    "invalid_local_file_url",
    "本地文件记录缺少 local-file: 前缀",
    value,
  );
  try {
    return decodeURIComponent(value.slice("local-file:".length));
  } catch (error) {
    fail("invalid_local_file_url", "本地文件路径无法解码", String(error));
  }
}

function encodeLocalFile(value) {
  return `local-file:${encodeURIComponent(value)}`;
}

function extractMagnetHash(value) {
  const match = String(value).match(
    /(?:^|[?&])xt=urn:btih:([a-f0-9]{40}|[a-z2-7]{32})(?:&|$)/i,
  );
  return match?.[1]?.toLowerCase() ?? null;
}

function fileState(filePath) {
  if (!existsSync(filePath)) return { exists: false, bytes: null };
  const stat = statSync(filePath);
  return { exists: stat.isFile(), bytes: stat.isFile() ? stat.size : null };
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = openSync(filePath, "r");
  try {
    let offset = 0;
    while (true) {
      const read = readSync(fd, buffer, 0, buffer.length, offset);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
      offset += read;
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

function inspectResources(sourceRoot, targetRoot) {
  return Object.entries(RESOURCE_FILES).map(([key, name]) => {
    const sourcePath = join(sourceRoot, name);
    const targetPath = join(targetRoot, name);
    return {
      key,
      name,
      sourcePath,
      targetPath,
      source: fileState(sourcePath),
      target: fileState(targetPath),
      linkedByMigration: key !== "slime",
    };
  });
}

function verifyResourceTargets(resources) {
  for (const resource of resources) {
    assertCondition(
      resource.source.exists,
      "source_resource_missing",
      `源视频不存在：${resource.sourcePath}`,
    );
    assertCondition(
      resource.target.exists,
      "target_resource_missing",
      `--apply 前必须先复制视频：${resource.targetPath}`,
    );
    const sourcePath = canonicalExistingPath(resource.sourcePath);
    const targetPath = canonicalExistingPath(resource.targetPath);
    assertDistinctDownloadPaths(sourcePath, targetPath);
    assertCondition(
      resource.source.bytes === resource.target.bytes,
      "resource_size_mismatch",
      `源/目标视频大小不同：${resource.name}`,
      { source: resource.source.bytes, target: resource.target.bytes },
    );
    const sourceHash = sha256File(resource.sourcePath);
    const targetHash = sha256File(resource.targetPath);
    assertCondition(
      sourceHash === targetHash,
      "resource_hash_mismatch",
      `源/目标视频 SHA-256 不同：${resource.name}`,
      { sourceHash, targetHash },
    );
    resource.source.sha256 = sourceHash;
    resource.target.sha256 = targetHash;
  }
}

function relationCountsForAnime(db, animeId) {
  const tables = [
    "episodes",
    "user_anime",
    "watch_events",
    "playback_progress",
    "download_queue",
  ];
  return Object.fromEntries(
    tables.map((table) => [
      table,
      Number(
        db
          .prepare(
            `select count(*) as count from ${quoteIdentifier(table)} where anime_id = ?`,
          )
          .get(animeId).count,
      ),
    ]),
  );
}

function assertTargetBaseline(db) {
  const counts = readCounts(db);
  const nonEmpty = EXPECTED_EMPTY_TARGET_TABLES.filter(
    (table) => counts[table] !== 0,
  );
  assertCondition(
    nonEmpty.length === 0,
    "target_not_empty",
    "目标库业务内容表必须为空",
    nonEmpty.map((table) => ({ table, count: counts[table] })),
  );
  assertCondition(
    counts.users === 1,
    "target_user_baseline_mismatch",
    "目标库必须仅保留一个 Desktop 用户",
    counts.users,
  );
  assertCondition(
    counts.rss_sources === 1,
    "target_rss_baseline_mismatch",
    "目标库必须仅保留一条 Desktop RSS 基线",
    counts.rss_sources,
  );
  assertCondition(
    counts.app_settings === 1,
    "target_settings_baseline_mismatch",
    "目标库必须仅保留 user_theme 基线",
    counts.app_settings,
  );

  const user = db.prepare("select id, username from users").get();
  assertCondition(
    user?.username === "admin" && typeof user.id === "string",
    "target_admin_missing",
    "目标库唯一用户必须是 Desktop admin",
    user,
  );
  const setting = db.prepare("select key from app_settings").get();
  assertCondition(
    setting?.key === "user_theme",
    "target_theme_baseline_missing",
    "目标库设置基线必须是 user_theme",
    setting,
  );
  return { counts, admin: user };
}

function assertSourceSnapshot(db) {
  const counts = readCounts(db);
  assertCounts(
    counts,
    EXPECTED_SOURCE_COUNTS,
    "source_snapshot_changed",
    "Web 源库",
  );

  const users = readRows(db, "users");
  assertCondition(
    users.length === 1 && users[0].username === "demo",
    "source_user_mismatch",
    "Web 源库必须只有 luis 用户",
    users.map(({ id, username }) => ({ id, username })),
  );
  const sourceUserId = users[0].id;
  for (const table of ["user_anime", "watch_events", "playback_progress"]) {
    const foreignUsers = db
      .prepare(
        `select distinct user_id from ${quoteIdentifier(table)} where user_id <> ?`,
      )
      .all(sourceUserId);
    assertCondition(
      foreignUsers.length === 0,
      "source_multiple_users",
      `${table} 包含 luis 以外的用户关系`,
      foreignUsers,
    );
  }
  return { counts, user: users[0] };
}

function mergeDoubanIntoCanonical(canonical, duplicate) {
  return {
    ...canonical,
    douban_id: canonical.douban_id ?? duplicate.douban_id,
    douban_rating: canonical.douban_rating ?? duplicate.douban_rating,
    douban_rating_fetched_at:
      canonical.douban_rating_fetched_at ?? duplicate.douban_rating_fetched_at,
    watch_providers: canonical.watch_providers ?? duplicate.watch_providers,
  };
}

function mergeQaVerifiedDoubanMapping(canonical, mapping) {
  let existingTags = [];
  if (canonical.tags != null) {
    try {
      const parsed = JSON.parse(canonical.tags);
      assertCondition(
        Array.isArray(parsed) && parsed.every((tag) => typeof tag === "string"),
        "qa_mapping_tags_invalid",
        `id${canonical.id} tags 不是字符串数组`,
        canonical.tags,
      );
      existingTags = parsed;
    } catch (error) {
      if (error instanceof MigrationError) throw error;
      fail(
        "qa_mapping_tags_invalid",
        `id${canonical.id} tags 无法解析`,
        canonical.tags,
      );
    }
  }
  return {
    ...canonical,
    douban_id: mapping.doubanId,
    douban_rating: mapping.rating,
    douban_rating_fetched_at: mapping.fetchedAt,
    total_episodes: Math.max(
      Number(canonical.total_episodes) || 0,
      mapping.totalEpisodes,
    ),
    tags: JSON.stringify([...new Set([...existingTags, ...mapping.tags])]),
  };
}

function sanitizeArchivedDownload(row, reason) {
  return {
    id: row.id,
    animeId: row.anime_id,
    episodeId: row.episode_id,
    title: row.title,
    status: row.status,
    progress: row.progress,
    infoHash: extractMagnetHash(row.magnet_url),
    reason,
  };
}

function buildMigrationPlan(sourceDb, targetDb, options) {
  const sourceHealth = assertDatabaseHealthy(sourceDb, "Web 源库");
  const targetHealth = assertDatabaseHealthy(targetDb, "Desktop 目标库");
  const sourceSnapshot = assertSourceSnapshot(sourceDb);
  const targetBaseline = assertTargetBaseline(targetDb);
  const sequences = buildSequencePlan(sourceDb, targetDb);

  const sourceRss = readRows(sourceDb, "rss_sources");
  const targetRss = readRows(targetDb, "rss_sources");
  assertCondition(
    sourceRss[0]?.url === targetRss[0]?.url,
    "rss_url_mismatch",
    "Web 与 Desktop RSS URL 不同，拒绝自动合并",
    { source: sourceRss[0]?.url, target: targetRss[0]?.url },
  );

  const sourceSettings = readRows(sourceDb, "app_settings");
  const sourceSettingKeys = sourceSettings.map((row) => row.key);
  const navKeys = sourceSettingKeys.filter((key) =>
    key.startsWith("nav_notifications_read:"),
  );
  const allowedKeys = new Set([
    ...SETTINGS_TO_MIGRATE,
    "user_theme",
    ...navKeys,
  ]);
  const unknownKeys = sourceSettingKeys.filter((key) => !allowedKeys.has(key));
  assertCondition(
    navKeys.length === 1 && unknownKeys.length === 0,
    "source_settings_changed",
    "Web 设置键已变化，拒绝静默丢弃",
    { sourceSettingKeys, unknownKeys, navKeys },
  );
  for (const key of SETTINGS_TO_MIGRATE) {
    assertCondition(
      sourceSettingKeys.includes(key),
      "source_setting_missing",
      `Web 设置缺少 ${key}`,
    );
  }

  const sourceAnime = readRows(sourceDb, "anime");
  const duplicate = sourceAnime.find((row) => row.id === 766);
  const canonical = sourceAnime.find((row) => row.id === 787);
  assertCondition(
    duplicate?.media_type === "drama" && duplicate?.douban_id === "37441858",
    "duplicate_766_changed",
    "id766 已偏离预期空壳 drama",
    duplicate,
  );
  assertCondition(
    canonical?.media_type === "anime" && canonical?.bangumi_id === 571784,
    "canonical_787_changed",
    "id787 已偏离预期 Bangumi anime",
    canonical,
  );
  assertCondition(
    canonical.douban_id == null || canonical.douban_id === duplicate.douban_id,
    "canonical_787_douban_conflict",
    "id787 已绑定其他豆瓣 ID",
    canonical.douban_id,
  );
  const qaMapping = QA_VERIFIED_DOUBAN_MAPPING;
  const grandBlueCanonical = sourceAnime.find(
    (row) => row.id === qaMapping.canonicalId,
  );
  assertCondition(
    grandBlueCanonical?.media_type === "anime" &&
      grandBlueCanonical?.bangumi_id === qaMapping.bangumiId &&
      grandBlueCanonical?.title === qaMapping.title &&
      grandBlueCanonical?.title_ja === qaMapping.titleJa &&
      grandBlueCanonical?.year === qaMapping.year,
    "canonical_792_changed",
    "id792 已偏离 QA 封存映射对应的 Bangumi 动画",
    grandBlueCanonical,
  );
  const grandBlueFieldConflicts = [
    ["douban_id", grandBlueCanonical.douban_id, qaMapping.doubanId],
    ["douban_rating", grandBlueCanonical.douban_rating, qaMapping.rating],
    [
      "douban_rating_fetched_at",
      grandBlueCanonical.douban_rating_fetched_at,
      qaMapping.fetchedAt,
    ],
  ].filter(([, actual, expected]) => actual != null && actual !== expected);
  const grandBlueIdConflicts = sourceAnime
    .filter(
      (row) =>
        row.id !== qaMapping.canonicalId && row.douban_id === qaMapping.doubanId,
    )
    .map((row) => row.id);
  assertCondition(
    grandBlueFieldConflicts.length === 0 && grandBlueIdConflicts.length === 0,
    "qa_mapping_792_conflict",
    "QA 封存豆瓣映射与 Web 源库已有字段冲突",
    { fieldConflicts: grandBlueFieldConflicts, rowConflicts: grandBlueIdConflicts },
  );
  const duplicateRelations = relationCountsForAnime(sourceDb, 766);
  assertCondition(
    Object.values(duplicateRelations).every((count) => count === 0),
    "duplicate_766_has_relations",
    "id766 已出现业务关系，拒绝按空壳删除",
    duplicateRelations,
  );

  const animeRows = sourceAnime
    .filter((row) => row.id !== 766)
    .map((row) => {
      if (row.id === 787) return mergeDoubanIntoCanonical(row, duplicate);
      if (row.id === qaMapping.canonicalId) {
        return mergeQaVerifiedDoubanMapping(row, qaMapping);
      }
      return row;
    });

  const sourceUserId = sourceSnapshot.user.id;
  const targetUserId = targetBaseline.admin.id;
  const sourceUserAnimeRows = readRows(sourceDb, "user_anime");
  assertCondition(
    sourceUserAnimeRows.filter(
      (row) => row.anime_id === 831 && row.current_episode === 26,
    ).length === 1,
    "progress_831_changed",
    "未找到唯一的 id831 currentEpisode=26 源记录",
  );
  assertCondition(
    sourceUserAnimeRows.filter(
      (row) => row.anime_id === 691 && row.current_episode === 20,
    ).length === 1,
    "progress_691_changed",
    "未找到唯一的 id691 currentEpisode=20 源记录",
  );
  const userAnimeRows = sourceUserAnimeRows.map((row) => ({
    ...row,
    user_id: targetUserId,
    current_episode:
      row.anime_id === 831 && row.current_episode === 26
        ? 25
        : row.current_episode,
  }));
  const converted831 = userAnimeRows.filter(
    (row) => row.anime_id === 831 && row.current_episode === 25,
  );
  assertCondition(
    converted831.length === 1,
    "progress_831_changed",
    "未找到唯一的 id831 26→25 迁移候选",
  );
  const kept691 = userAnimeRows.filter(
    (row) => row.anime_id === 691 && row.current_episode === 20,
  );
  assertCondition(
    kept691.length === 1,
    "progress_691_changed",
    "id691 currentEpisode=20 已变化，拒绝猜测",
  );

  const watchEventRows = readRows(sourceDb, "watch_events").map((row) => ({
    ...row,
    user_id: targetUserId,
  }));
  const playbackRows = readRows(sourceDb, "playback_progress").map((row) => ({
    ...row,
    user_id: targetUserId,
  }));

  const sourceDownloadRows = readRows(sourceDb, "download_queue");
  const byDownloadId = new Map(sourceDownloadRows.map((row) => [row.id, row]));
  for (const id of [752, 753, 754, 755, 756]) {
    assertCondition(
      byDownloadId.has(id),
      "download_rule_row_missing",
      `下载迁移规则依赖的 id${id} 不存在`,
    );
  }
  const localDownloadRows = sourceDownloadRows.filter((row) =>
    String(row.magnet_url).startsWith("local-file:"),
  );
  const magnetDownloadRows = sourceDownloadRows.filter((row) =>
    String(row.magnet_url).startsWith("magnet:?")
  );
  assertCondition(
    localDownloadRows.length === 296 &&
      magnetDownloadRows.length === 4 &&
      magnetDownloadRows.every((row) => [752, 754, 755, 756].includes(row.id)),
    "download_source_mix_changed",
    "Web download_queue 的 local-file/magnet 构成已变化",
    {
      localFile: localDownloadRows.length,
      magnets: magnetDownloadRows.map((row) => row.id),
    },
  );
  const expectedDownloadStates = new Map([
    [752, "completed"],
    [753, "completed"],
    [754, "completed"],
    [755, "completed"],
    [756, "failed"],
  ]);
  for (const [id, status] of expectedDownloadStates) {
    assertCondition(
      byDownloadId.get(id).status === status,
      "download_rule_status_changed",
      `下载 id${id} 状态已变化`,
      byDownloadId.get(id).status,
    );
  }

  const resources = inspectResources(
    options.sourceDownloadRoot,
    options.targetDownloadRoot,
  );
  for (const resource of resources) {
    assertCondition(
      resource.source.exists,
      "source_resource_missing",
      `源视频不存在：${resource.sourcePath}`,
    );
  }
  const resourceByKey = new Map(resources.map((resource) => [resource.key, resource]));
  const grandBlue = resourceByKey.get("grandBlue");
  const girlfriends = resourceByKey.get("girlfriends");
  const grandBlueLocal = byDownloadId.get(753);
  assertCondition(
    decodeLocalFile(grandBlueLocal.magnet_url) === grandBlue.sourcePath,
    "download_753_path_changed",
    "id753 不再指向预期 Web 下载文件",
    decodeLocalFile(grandBlueLocal.magnet_url),
  );
  const shadow752 = byDownloadId.get(752);
  assertCondition(
    shadow752.anime_id === grandBlueLocal.anime_id &&
      shadow752.episode_id === grandBlueLocal.episode_id,
    "download_752_not_shadow",
    "id752 不再是 id753 的 magnet 影子",
  );

  const missingLocalFiles = localDownloadRows
    .map((row) => ({ row, path: decodeLocalFile(row.magnet_url) }))
    .filter(({ path }) => !fileState(path).exists)
    .map(({ row, path }) => ({ id: row.id, path }));
  assertCondition(
    missingLocalFiles.length === 0,
    "local_file_missing",
    "Web download_queue 含不存在的 local-file 路径",
    missingLocalFiles,
  );
  const slime = resourceByKey.get("slime");
  assertCondition(
    localDownloadRows.every(
      (row) => decodeLocalFile(row.magnet_url) !== slime.sourcePath,
    ),
    "slime_already_linked",
    "史莱姆文件已出现 download_queue 关系，需重新审查后再迁移",
  );

  const downloadRows = sourceDownloadRows
    .filter((row) => !ARCHIVED_DOWNLOAD_IDS.has(row.id))
    .map((row) => {
      if (row.id === 753) {
        return {
          ...row,
          magnet_url: encodeLocalFile(grandBlue.targetPath),
        };
      }
      if (row.id === 754) {
        return {
          ...row,
          title: girlfriends.name,
          magnet_url: encodeLocalFile(girlfriends.targetPath),
          status: "completed",
          progress: 100,
          error_message: null,
        };
      }
      return row;
    });

  const archivedDownloads = [
    sanitizeArchivedDownload(byDownloadId.get(752), "local_file_shadow_exists"),
    sanitizeArchivedDownload(byDownloadId.get(755), "file_and_qbit_unverified"),
    sanitizeArchivedDownload(byDownloadId.get(756), "failed_webui_unreachable"),
  ];

  const settingsRows = sourceSettings.filter((row) =>
    SETTINGS_TO_MIGRATE.includes(row.key),
  );

  const rows = {
    anime: animeRows,
    episodes: readRows(sourceDb, "episodes"),
    user_anime: userAnimeRows,
    watch_events: watchEventRows,
    playback_progress: playbackRows,
    download_queue: downloadRows,
    app_settings: settingsRows,
  };
  const plannedCounts = {
    users: targetBaseline.counts.users,
    anime: rows.anime.length,
    user_anime: rows.user_anime.length,
    episodes: rows.episodes.length,
    watch_events: rows.watch_events.length,
    playback_progress: rows.playback_progress.length,
    rss_sources: targetBaseline.counts.rss_sources,
    app_settings: targetBaseline.counts.app_settings + rows.app_settings.length,
    download_queue: rows.download_queue.length,
  };
  assertCounts(
    plannedCounts,
    EXPECTED_MIGRATED_COUNTS,
    "planned_counts_changed",
    "迁移计划",
  );

  return {
    rows,
    sequences,
    report: {
      source: {
        user: { id: sourceUserId, username: sourceSnapshot.user.username },
        counts: sourceSnapshot.counts,
        checks: sourceHealth,
      },
      targetBaseline: {
        user: { id: targetUserId, username: targetBaseline.admin.username },
        counts: targetBaseline.counts,
        checks: targetHealth,
      },
      expectedCounts: EXPECTED_MIGRATED_COUNTS,
      sequenceBaselines: {
        source: sequences.sourceBaseline,
        target: sequences.targetBaseline,
      },
      transformations: {
        userId: { from: sourceUserId, to: targetUserId },
        mergedAnime: {
          removedId: 766,
          canonicalId: 787,
          doubanId: duplicate.douban_id,
          canonicalRelationCounts: relationCountsForAnime(sourceDb, 787),
        },
        qaVerifiedMappings: [
          {
            source: qaMapping.source,
            evidenceId: qaMapping.evidenceId,
            canonicalId: qaMapping.canonicalId,
            bangumiId: qaMapping.bangumiId,
            doubanId: qaMapping.doubanId,
            rating: qaMapping.rating,
            fetchedAt: qaMapping.fetchedAt,
            mergedTags: qaMapping.tags,
            preservedFields: [
              "title",
              "titleJa",
              "coverUrl",
              "synopsis",
              "episodes",
              "totalEpisodes",
            ],
          },
        ],
        currentEpisode: [
          { animeId: 831, from: 26, to: 25, evidence: "completed EP25" },
          { animeId: 691, from: 20, to: 20, evidence: "explicit keep rule" },
        ],
        rss: {
          action: "keep_desktop_row_by_url",
          url: targetRss[0].url,
          desktopId: targetRss[0].id,
          discardedWebId: sourceRss[0].id,
        },
        settings: {
          migrated: SETTINGS_TO_MIGRATE,
          keptDesktop: ["user_theme"],
          discarded: navKeys,
        },
        downloads: {
          activeRows: downloadRows.length,
          archived: archivedDownloads,
          convertedToLocalFile: [754],
          rewrittenLocalFile: [753],
          unlinkedResources: [RESOURCE_FILES.slime],
        },
      },
      resources,
    },
  };
}

function insertRows(db, table, rows) {
  if (rows.length === 0) return;
  const columns = db
    .prepare(`pragma table_info(${quoteIdentifier(table)})`)
    .all()
    .map((column) => column.name);
  const placeholders = columns.map(() => "?").join(", ");
  const statement = db.prepare(
    `insert into ${quoteIdentifier(table)} (${columns
      .map(quoteIdentifier)
      .join(", ")}) values (${placeholders})`,
  );
  for (const row of rows) {
    statement.run(...columns.map((column) => row[column] ?? null));
  }
}

function preserveAutoincrementSequences(db, sequencePlan) {
  const update = db.prepare("update sqlite_sequence set seq = ? where name = ?");
  const insert = db.prepare("insert into sqlite_sequence (name, seq) values (?, ?)");
  const result = {};

  for (const { table, primaryKey } of sequencePlan.tables) {
    const migratedMaxId = Number(
      db
        .prepare(
          `select coalesce(max(${quoteIdentifier(primaryKey)}), 0) as maxId
           from ${quoteIdentifier(table)}`,
        )
        .get().maxId,
    );
    const sourceBaseline = Number(sequencePlan.sourceBaseline[table] ?? 0);
    const targetBaseline = Number(sequencePlan.targetBaseline[table] ?? 0);
    const expected = Math.max(sourceBaseline, targetBaseline, migratedMaxId);
    if (update.run(expected, table).changes === 0) {
      insert.run(table, expected);
    }
    const actual = Number(
      db.prepare("select seq from sqlite_sequence where name = ?").get(table)?.seq ?? 0,
    );
    assertCondition(
      actual === expected,
      "sqlite_sequence_mismatch",
      `${table} AUTOINCREMENT 序列保留失败`,
      { sourceBaseline, targetBaseline, migratedMaxId, expected, actual },
    );
    result[table] = {
      sourceBaseline,
      targetBaseline,
      migratedMaxId,
      final: actual,
    };
  }

  return result;
}

function executeMigration(db, plan) {
  db.pragma("foreign_keys = ON");
  const migrate = db.transaction(() => {
    insertRows(db, "anime", plan.rows.anime);
    insertRows(db, "episodes", plan.rows.episodes);
    insertRows(db, "user_anime", plan.rows.user_anime);
    insertRows(db, "watch_events", plan.rows.watch_events);
    insertRows(db, "playback_progress", plan.rows.playback_progress);
    insertRows(db, "download_queue", plan.rows.download_queue);
    insertRows(db, "app_settings", plan.rows.app_settings);

    const sequences = preserveAutoincrementSequences(db, plan.sequences);

    const actualCounts = readCounts(db);
    assertCounts(
      actualCounts,
      EXPECTED_MIGRATED_COUNTS,
      "post_migration_counts_mismatch",
      "迁移结果",
    );
    const checks = assertDatabaseHealthy(db, "迁移结果");
    return { actualCounts, checks, sequences };
  });
  return migrate();
}

function cloneDatabaseInMemory(sourceDb) {
  const clone = new Database(":memory:");
  clone.pragma("foreign_keys = OFF");
  const schema = sourceDb
    .prepare(
      `select type, name, sql
       from sqlite_master
       where sql is not null and name not like 'sqlite_%'
       order by case type when 'table' then 0 when 'index' then 1 else 2 end, name`,
    )
    .all();
  for (const row of schema.filter((item) => item.type === "table")) {
    clone.exec(row.sql);
  }
  for (const table of TABLES) {
    insertRows(clone, table, readRows(sourceDb, table));
  }
  for (const row of schema.filter((item) => item.type !== "table")) {
    clone.exec(row.sql);
  }
  clone.pragma("foreign_keys = ON");
  return clone;
}

function simulateMigration(targetDb, plan) {
  const clone = cloneDatabaseInMemory(targetDb);
  try {
    return executeMigration(clone, plan);
  } finally {
    clone.close();
  }
}

function copyDatabaseTrio(dbPath, destination) {
  mkdirSync(destination, { recursive: true });
  const copied = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = `${dbPath}${suffix}`;
    if (!existsSync(source)) continue;
    const target = join(destination, `anime.db${suffix}`);
    copyFileSync(source, target);
    copied.push({
      source,
      target,
      bytes: statSync(target).size,
      sha256: sha256File(target),
    });
  }
  return copied;
}

async function createBackups({
  sourceDb,
  targetDb,
  sourcePath,
  targetPath,
  backupDir,
}) {
  const absolute = resolve(backupDir);
  assertCondition(
    !existsSync(absolute),
    "backup_dir_exists",
    `备份目录已存在，拒绝覆盖：${absolute}`,
  );
  const sourceDir = join(absolute, "source-web");
  const targetDir = join(absolute, "target-desktop");
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(targetDir, { recursive: true });

  const sourceTrio = copyDatabaseTrio(sourcePath, sourceDir);
  const targetTrio = copyDatabaseTrio(targetPath, targetDir);
  const sourceConsistent = join(sourceDir, "anime-consistent.db");
  const targetConsistent = join(targetDir, "anime-consistent.db");
  await sourceDb.backup(sourceConsistent);
  await targetDb.backup(targetConsistent);

  for (const consistentPath of [sourceConsistent, targetConsistent]) {
    const db = new Database(consistentPath, { readonly: true });
    try {
      assertDatabaseHealthy(db, `一致性备份 ${consistentPath}`);
    } finally {
      db.close();
    }
  }

  return {
    directory: absolute,
    sourceTrio,
    targetTrio,
    consistent: [
      {
        path: sourceConsistent,
        bytes: statSync(sourceConsistent).size,
        sha256: sha256File(sourceConsistent),
      },
      {
        path: targetConsistent,
        bytes: statSync(targetConsistent).size,
        sha256: sha256File(targetConsistent),
      },
    ],
  };
}

export function parseArguments(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const key = {
      "--source": "source",
      "--target": "target",
      "--source-download-root": "sourceDownloadRoot",
      "--target-download-root": "targetDownloadRoot",
      "--backup-dir": "backupDir",
    }[argument];
    assertCondition(key, "unknown_argument", `未知参数：${argument}`);
    const value = argv[index + 1];
    assertCondition(
      typeof value === "string" && !value.startsWith("--"),
      "argument_value_missing",
      `${argument} 缺少路径`,
    );
    options[key] = value;
    index += 1;
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/migrate-web-to-desktop.mjs \\",
    "    --source <web-anime.db> --target <desktop-anime.db> \\",
    "    --source-download-root <web-download> \\",
    "    --target-download-root <desktop-download>",
    "",
    "Default: dry-run with an in-memory target simulation.",
    "Apply: add --apply --backup-dir <new-empty-directory> after copying the three videos.",
  ].join("\n");
}

export async function runMigration(options) {
  for (const key of [
    "source",
    "target",
    "sourceDownloadRoot",
    "targetDownloadRoot",
  ]) {
    assertCondition(
      typeof options[key] === "string" && options[key].trim(),
      "required_argument_missing",
      `缺少必填参数：${key}`,
    );
  }
  if (options.apply) {
    assertCondition(
      typeof options.backupDir === "string" && options.backupDir.trim(),
      "backup_dir_required",
      "--apply 必须同时传入全新的 --backup-dir",
    );
  }

  const sourcePath = canonicalExistingPath(options.source);
  const targetPath = canonicalExistingPath(options.target);
  assertCondition(
    !samePath(sourcePath, targetPath),
    "same_database",
    "源库与目标库不能是同一个文件",
    { sourcePath, targetPath },
  );
  const sourceDownloadRoot = canonicalExistingPath(options.sourceDownloadRoot);
  const targetDownloadRoot = canonicalPathForComparison(options.targetDownloadRoot);
  assertDistinctDownloadPaths(sourceDownloadRoot, targetDownloadRoot);

  const sourceDb = new Database(sourcePath, {
    readonly: true,
    fileMustExist: true,
  });
  const targetDb = new Database(targetPath, {
    readonly: !options.apply,
    fileMustExist: true,
  });
  sourceDb.pragma("query_only = ON");
  if (!options.apply) targetDb.pragma("query_only = ON");

  try {
    const plan = buildMigrationPlan(sourceDb, targetDb, {
      sourceDownloadRoot,
      targetDownloadRoot,
    });
    if (!options.apply) {
      const simulation = simulateMigration(targetDb, plan);
      return {
        ok: true,
        mode: "dry-run",
        databaseWritten: false,
        sourcePath,
        targetPath,
        ...plan.report,
        result: {
          expectedCounts: EXPECTED_MIGRATED_COUNTS,
          actualCounts: simulation.actualCounts,
          checks: simulation.checks,
          sequences: simulation.sequences,
        },
        applyReadiness: {
          databasePreconditionsPassed: true,
          resourcesNeedCopy: plan.report.resources
            .filter((resource) => !resource.target.exists)
            .map((resource) => ({
              source: resource.sourcePath,
              target: resource.targetPath,
              bytes: resource.source.bytes,
            })),
        },
      };
    }

    verifyResourceTargets(plan.report.resources);
    const backups = await createBackups({
      sourceDb,
      targetDb,
      sourcePath,
      targetPath,
      backupDir: options.backupDir,
    });
    const result = executeMigration(targetDb, plan);
    return {
      ok: true,
      mode: "apply",
      databaseWritten: true,
      sourcePath,
      targetPath,
      ...plan.report,
      backups,
      result: {
        expectedCounts: EXPECTED_MIGRATED_COUNTS,
        actualCounts: result.actualCounts,
        checks: result.checks,
        sequences: result.sequences,
      },
    };
  } finally {
    targetDb.close();
    sourceDb.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = await runMigration(options);
  console.log(JSON.stringify(report, null, 2));
}

const isDirectExecution =
  process.argv[1] != null &&
  samePath(resolve(process.argv[1]), resolve(fileURLToPath(import.meta.url)));

if (isDirectExecution) {
  main().catch((error) => {
    const report = {
      ok: false,
      error: {
        code: error instanceof MigrationError ? error.code : "unexpected_error",
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof MigrationError ? error.details : undefined,
      },
    };
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  });
}
