export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 32;

export type ProfileDisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function parseProfileDisplayName(input: unknown): ProfileDisplayNameResult {
  if (typeof input !== "string") {
    return { ok: false, error: "请输入名称" };
  }

  const value = input.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, error: "名称不能为空" };
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return { ok: false, error: "名称包含不可用字符" };
  }
  if (Array.from(value).length > PROFILE_DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `名称最多 ${PROFILE_DISPLAY_NAME_MAX_LENGTH} 个字符`,
    };
  }

  return { ok: true, value };
}
