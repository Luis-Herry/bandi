export const DOWNLOAD_ISSUE_LOCAL_FILE_MISSING = "local_file_missing";
export const DOWNLOAD_ISSUE_QBIT_ERROR = "qbit_error";

export type DownloadIssueCode =
  | typeof DOWNLOAD_ISSUE_LOCAL_FILE_MISSING
  | typeof DOWNLOAD_ISSUE_QBIT_ERROR;
