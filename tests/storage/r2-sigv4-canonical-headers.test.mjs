import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../lib/storage/r2.ts", import.meta.url), "utf8");

test("R2 presigned canonical header blocks terminate with a newline", () => {
  assert.ok(
    source.includes("? `content-type:${contentType.trim()}\\nhost:${host}\\n`\n    : `host:${host}\\n`;"),
    "presigned PUT and GET canonical headers must retain their trailing newline",
  );
});

test("R2 authenticated canonical headers retain the required separator", () => {
  assert.ok(
    source.includes('  ].join("\\n") + "\\n";'),
    "authenticated canonical headers must end with a newline before SignedHeaders",
  );
});
