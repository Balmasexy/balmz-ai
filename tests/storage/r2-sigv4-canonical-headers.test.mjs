import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../lib/storage/r2.ts", import.meta.url), "utf8");

test("R2 presigned canonical headers end with the required newline", () => {
  assert.match(source, /\? `content-type:\\${contentType\.trim\(\)}\\nhost:\\${host}\\n`\s*: `host:\\${host}\\n`;/);
});

test("R2 authenticated canonical headers preserve the blank separator before SignedHeaders", () => {
  assert.match(source, /\]\.join\("\\\\n"\) \+ "\\\\n";/);
});
