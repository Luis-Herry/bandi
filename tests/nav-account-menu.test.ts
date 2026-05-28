import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");

test("Nav exposes an account menu from the avatar", () => {
  assert.match(navSource, /aria-label="打开用户菜单"/);
  assert.match(navSource, />个人中心</);
  assert.match(navSource, />设置中心</);
  assert.match(navSource, />退出登录</);
});

test("Nav signs out through the client NextAuth helper", () => {
  assert.match(navSource, /from "next-auth\/react"/);
  assert.match(navSource, /signOut\(\{\s*callbackUrl:\s*"\/login"\s*\}\)/s);
});

test("Nav theme menu shows a selected dot and check", () => {
  assert.match(navSource, /border-\[color:var\(--accent\)\]/);
  assert.match(navSource, /h-1\.5 w-1\.5 rounded-full bg-\[color:var\(--accent\)\]/);
  assert.match(navSource, /<Check size=\{13\} className="text-\[color:var\(--accent\)\]"/);
});

test("Nav theme menu labels themes by color only", async () => {
  const { THEME_OPTIONS } = await import("../src/lib/theme-options");

  assert.deepEqual(
    THEME_OPTIONS.map((theme) => theme.label),
    ["琥珀金（默认）", "赤红珊瑚", "鼠尾草绿", "暖紫", "蜜桃粉", "冷青蓝"],
  );
  assert.doesNotMatch(navSource, /item\.tone/);
  assert.doesNotMatch(navSource, /mt-0\.5 block truncate text-\[10px\]/);
});
