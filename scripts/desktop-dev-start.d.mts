export interface DesktopBuildInspection {
  needsBuild: boolean;
  reason:
    | "missing_build"
    | "incomplete_build"
    | "missing_manifest"
    | "invalid_manifest"
    | "inputs_changed"
    | "up_to_date";
}

export function inspectDesktopBuild(root: string): DesktopBuildInspection;
export function getDesktopBuildInputHash(root: string): string;
export function writeDesktopBuildStamp(root: string, expectedInputHash?: string): void;
