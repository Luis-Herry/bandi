import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/windows-n1-update-acceptance.yml",
  "utf8",
);
const acceptance = readFileSync(
  "scripts/acceptance/windows-n1-update.ps1",
  "utf8",
);
const cdp = readFileSync("scripts/acceptance/cdp-client.mjs", "utf8");

test("Windows N-1 acceptance is manual, read-only, isolated, and fail-closed", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /matrix:\s*\n\s+mode: \[setup, portable\]/);
  assert.match(workflow, /timeout-minutes: 90/);
  assert.match(workflow, /BASE_TAG: \$\{\{ inputs\.base_tag \}\}/);
  assert.match(workflow, /TARGET_TAG: \$\{\{ inputs\.target_tag \}\}/);
  assert.match(workflow, /-BaseTag \$env:BASE_TAG/);
  assert.match(workflow, /-TargetTag \$env:TARGET_TAG/);
  assert.doesNotMatch(workflow, /-BaseTag ['"]?\$\{\{/);
  assert.doesNotMatch(workflow, /-TargetTag ['"]?\$\{\{/);
  assert.doesNotMatch(workflow, /upload-artifact|pull_request:|push:/);
  assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d/);

  assert.match(acceptance, /bandi-n1-/);
  assert.match(acceptance, /GITHUB_ACTIONS -ne "true"/);
  assert.match(acceptance, /GitHub Actions runner/);
  assert.doesNotMatch(acceptance, /\$env:(?:APPDATA|LOCALAPPDATA|USERPROFILE)\s*=/);
  assert.match(acceptance, /"Downloads", "Music", "Pictures", "Videos"/);
  assert.match(acceptance, /application data was not clean before acceptance/);
  assert.match(acceptance, /pinnedBaseChecksums/);
  assert.match(acceptance, /releases\/latest/);
  assert.match(acceptance, /Get-FileHash[^\n]+SHA256/);
  assert.match(acceptance, /restart-to-install/);
  assert.match(acceptance, /install-portable/);
  assert.match(acceptance, /Start-Sleep -Seconds 60/);
  assert.match(acceptance, /parent-lease\.json/);
  assert.match(acceptance, /\$updatedAt -lt \$NotBeforeMs/);
  assert.match(acceptance, /\$now - \$updatedAt/);
  assert.match(acceptance, /\$token -notmatch "\^\[A-Za-z0-9_-\]\{32\}\$"/);
  assert.match(acceptance, /token = \$token/);
  assert.match(acceptance, /Get-LeaseState \$leaseFile \$baselineLaunchAfter/);
  assert.match(acceptance, /Get-LeaseState \$leaseFile \$installAcceptedAfter/);
  assert.match(acceptance, /Get-LeaseState \$leaseFile \$verifyLaunchAfter/);
  assert.match(acceptance, /\$candidate\.token -ne \$oldToken/);
  assert.match(acceptance, /\$stableLease\.token -eq \$newToken/);
  assert.match(acceptance, /\$candidate\.token -ne \$newToken/);
  assert.doesNotMatch(acceptance, /\$candidate\.pid -ne \$(?:oldPid|newPid)/);
  assert.match(acceptance, /ProductMajorPart -eq \$expected\.Major/);
  assert.match(acceptance, /\$appPath = \$basePackage/);
  assert.match(acceptance, /\$appPath = \$downloadedPackage/);
  assert.match(acceptance, /anime-tracker-updater\\pending/);
  assert.match(acceptance, /Downloads\\Bandi Updates/);
  assert.doesNotMatch(acceptance, /\$searchRoots = @\(\$root\)/);
  assert.match(acceptance, /candidateCount=\$\(\$downloadedCandidates\.Count\)/);
  assert.match(acceptance, /if \(\$Mode -eq "portable"\) \{ 600000 \}/);
  assert.match(acceptance, /if \(\$Mode -eq "portable"\) \{ 900 \}/);
  assert.equal((acceptance.match(/--user-data-dir=\$userData/g) ?? []).length, 2);
  assert.equal((acceptance.match(/^\s+"--headless",$/gm) ?? []).length, 2);
  assert.equal((acceptance.match(/^\s+"--no-sandbox",$/gm) ?? []).length, 2);
  assert.match(acceptance, /launcherAlive=\$launcherAlive; leaseHealthy=\$leaseHealthy/);
  assert.match(acceptance, /desktopErrorLogCount=\$desktopErrorLogCount/);
  assert.match(acceptance, /leaseTokenChanged=\$leaseTokenChanged/);
  assert.match(acceptance, /targetProcessCount=\$targetProcessCount/);
  assert.doesNotMatch(acceptance, /PreviousToken=|oldToken=|newToken=/);
  assert.match(acceptance, /configTouched=\$configTouched/);
  assert.doesNotMatch(acceptance, /commandLine=\$commandLine/);
  assert.match(acceptance, /configHashAfter -eq \$configHashBefore/);
  assert.match(acceptance, /SetEnvironmentVariable\(\$name, \$null, "Process"\)/);
  assert.match(acceptance, /"GH_TOKEN"/);
  assert.match(acceptance, /"ACTIONS_RUNTIME_TOKEN"/);
  assert.match(acceptance, /N1_ACCEPTANCE_RESULT=pass/);
  assert.doesNotMatch(acceptance, /Unblock-File|upload-artifact|config\.json.*Write-Output/);

  const clearTokensAt = acceptance.lastIndexOf("  Clear-ChildSensitiveEnvironment");
  assert.ok(clearTokensAt > acceptance.lastIndexOf("& gh"));
  assert.ok(clearTokensAt < acceptance.indexOf("Start-Process -FilePath $basePackage"));
});

test("Windows N-1 CDP client exposes only bounded update assertions", () => {
  assert.match(cdp, /window\.bandiDesktop\.getUpdateState/);
  assert.match(cdp, /window\.bandiDesktop\.checkForUpdates/);
  assert.match(cdp, /window\.bandiDesktop\.installUpdate/);
  assert.match(cdp, /aside\[role="status"\]/);
  assert.match(cdp, /positionFixed/);
  assert.match(cdp, /requestedPageTimeout/);
  assert.match(cdp, /requestedPageTimeout > 900_000/);
  assert.match(cdp, /CDP request timed out/);
  assert.match(cdp, /Trusted Bandi page did not become ready/);
  assert.match(cdp, /waitForPath/);
  assert.match(cdp, /waitForNotice/);
  assert.match(cdp, /__bandiAcceptanceLastCheck/);
  assert.match(cdp, /Bandi update check request failed/);
  assert.match(cdp, /Math\.min\(15_000, remainingMs\)/);
  assert.doesNotMatch(cdp, /document\.body\.innerText|document\.documentElement\.outerHTML/);
  assert.doesNotMatch(cdp, /captureScreenshot|writeFileSync/);
});
