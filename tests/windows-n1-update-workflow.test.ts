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
  assert.match(workflow, /BASE_TAG: \$\{\{ inputs\.base_tag \}\}/);
  assert.match(workflow, /TARGET_TAG: \$\{\{ inputs\.target_tag \}\}/);
  assert.match(workflow, /-BaseTag \$env:BASE_TAG/);
  assert.match(workflow, /-TargetTag \$env:TARGET_TAG/);
  assert.doesNotMatch(workflow, /-BaseTag ['"]?\$\{\{/);
  assert.doesNotMatch(workflow, /-TargetTag ['"]?\$\{\{/);
  assert.doesNotMatch(workflow, /upload-artifact|pull_request:|push:/);
  assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d/);

  assert.match(acceptance, /bandi-n1-/);
  assert.match(acceptance, /pinnedBaseChecksums/);
  assert.match(acceptance, /releases\/latest/);
  assert.match(acceptance, /Get-FileHash[^\n]+SHA256/);
  assert.match(acceptance, /restart-to-install/);
  assert.match(acceptance, /install-portable/);
  assert.match(acceptance, /Start-Sleep -Seconds 60/);
  assert.match(acceptance, /parent-lease\.json/);
  assert.match(acceptance, /ProductMajorPart -eq \$expected\.Major/);
  assert.match(acceptance, /Expand-PortablePackage \$basePackage/);
  assert.match(acceptance, /Expand-PortablePackage \$downloadedPackage/);
  assert.match(acceptance, /Join-Path \$env:ProgramFiles "7-Zip\\7z\.exe"/);
  assert.match(acceptance, /PORTABLE_EXECUTABLE_FILE = \$basePackage/);
  assert.match(acceptance, /PORTABLE_EXECUTABLE_FILE = \$downloadedPackage/);
  assert.match(acceptance, /--user-data-dir=\$debugProfile/);
  assert.match(acceptance, /--user-data-dir=\$verifyDebugProfile/);
  assert.equal((acceptance.match(/"--headless"/g) ?? []).length, 2);
  assert.equal((acceptance.match(/"--no-sandbox"/g) ?? []).length, 2);
  assert.match(acceptance, /launcherAlive=\$launcherAlive; leaseHealthy=\$leaseHealthy/);
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
  assert.doesNotMatch(cdp, /document\.body\.innerText|document\.documentElement\.outerHTML/);
  assert.doesNotMatch(cdp, /captureScreenshot|writeFileSync/);
});
