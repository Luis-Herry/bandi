import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cinemaScanSource = readFileSync(
  "src/components/features/CinemaScanButton.tsx",
  "utf8",
);
const librarySource = readFileSync(
  "src/app/(main)/library/LibraryClient.tsx",
  "utf8",
);
const ratingNotesSource = readFileSync(
  "src/components/features/RatingNotes.tsx",
  "utf8",
);
const matchRuleSource = readFileSync(
  "src/components/features/MatchRuleDialog.tsx",
  "utf8",
);

test("custom bordered form controls opt out of the global focus outline", () => {
  assert.match(
    cinemaScanSource,
    /<input[\s\S]*?data-no-focus-ring[\s\S]*?focus:border-\[color:var\(--accent\)\]/,
  );
  assert.match(
    librarySource,
    /<select[\s\S]*?data-no-focus-ring[\s\S]*?focus:border-\[color:var\(--accent-muted\)\]/,
  );
  assert.match(
    ratingNotesSource,
    /<textarea[\s\S]*?data-no-focus-ring[\s\S]*?focus:border-\[color:var\(--accent-muted\)\]/,
  );
  assert.match(
    matchRuleSource,
    /<select[\s\S]*?data-no-focus-ring[\s\S]*?focus:border-\[color:var\(--accent-muted\)\]/,
  );
  assert.match(
    matchRuleSource,
    /focus-within:border-\[color:var\(--accent-muted\)\]/,
  );
  assert.match(
    matchRuleSource,
    /<input[\s\S]*?data-no-focus-ring[\s\S]*?outline-none/,
  );
});
