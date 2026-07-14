import path from "node:path";

export type CompatibleMode = "remux" | "transcode";

export interface MediaProbe {
  videoCodec: string;
  audioCodec: string | null;
}

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const ASSET_NAME_PATTERN = /^(?:init\.mp4|segment_\d{6}\.m4s)$/;

export const EXPECTED_FFMPEG_SHA256: Readonly<Record<string, string>> = {
  "win32-x64": "04E1307997530F9CF2FE35CBA2CA7E8875CA91DA02F89D6C7243DF819C94AD00",
  "darwin-x64": "EBDDDC936F61E14049A2D4B549A412B8A40DEEFF6540E58A9F2A2DA9E6B18894",
  "darwin-arm64": "A90E3DB6A3FD35F6074B013F948B1AA45B31C6375489D39E572BEA3F18336584",
};

export function isCompatibleTaskId(value: string): boolean {
  return TASK_ID_PATTERN.test(value);
}

export function isCompatibleAssetName(value: string): boolean {
  return ASSET_NAME_PATTERN.test(value);
}

export function buildCompatibleFfmpegArgs({
  inputPath,
  outputDirectory,
  mode,
  probe,
}: {
  inputPath: string;
  outputDirectory: string;
  mode: CompatibleMode;
  probe: MediaProbe;
}): string[] {
  const outputPath = path.join(outputDirectory, "index.m3u8");
  const args = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
  ];

  if (mode === "remux") {
    args.push("-c:v", "copy");
    if (probe.videoCodec === "hevc" || probe.videoCodec === "h265") {
      args.push("-tag:v", "hvc1");
    }
    args.push("-c:a", probe.audioCodec === "aac" ? "copy" : "aac");
    if (probe.audioCodec !== "aac") args.push("-b:a", "160k", "-ac", "2");
  } else {
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-level",
      "4.1",
      "-force_key_frames",
      "expr:gte(t,n_forced*4)",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ac",
      "2",
    );
  }

  args.push(
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_list_size",
    "0",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "fmp4",
    "-hls_fmp4_init_filename",
    "init.mp4",
    "-hls_segment_filename",
    path.join(outputDirectory, "segment_%06d.m4s"),
    "-hls_flags",
    "independent_segments+temp_file",
    outputPath,
  );
  return args;
}
