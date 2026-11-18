import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [api, workspace] = await Promise.all([
  readFile(new URL("../../app/api/images/free-library/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../../app/dashboard/images/images-workspace.tsx", import.meta.url), "utf8"),
]);

const requiredCategories = [
  "all", "nature", "animals", "travel", "art", "design", "people",
  "food", "technology", "architecture", "business", "fashion", "sports",
  "education", "lifestyle", "space", "backgrounds", "wallpapers",
];

test("image API and workspace expose the same expanded category IDs", () => {
  const apiBlock = api.match(/const SEARCH_TERMS:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1] ?? "";
  const uiBlock = workspace.match(/const categories = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  for (const id of requiredCategories) {
    assert.match(apiBlock, new RegExp("^\\s*" + id + ":", "m"), "API category missing: " + id);
    assert.match(uiBlock, new RegExp('id: "' + id + '"'), "Workspace category missing: " + id);
  }
});

test("curated fallback provides at least three images for every non-All category", () => {
  const photoBlock = api.match(/const CURATED_PHOTOS:[\s\S]*?= \[([\s\S]*?)\n\];/)?.[1] ?? "";
  assert.ok(photoBlock.length > 0, "curated photo catalog must exist");
  for (const category of requiredCategories.filter((id) => id !== "all")) {
    const count = (photoBlock.match(new RegExp('category: "' + category + '"', "g")) ?? []).length;
    assert.ok(count >= 3, category + " has " + count + " curated images; expected at least 3");
  }
});

test("expanded creative templates provide real preview images", () => {
  const templateBlock = workspace.match(/const templates: Template\[\] = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  for (const title of [
    "Business card", "Flyer", "Restaurant menu", "Website hero", "Mobile app concept",
    "Book cover", "Podcast cover", "Product mockup", "Infographic", "Invitation",
    "Advertising creative", "Presentation layout",
  ]) {
    assert.ok(templateBlock.includes('title: "' + title + '"'), "template missing: " + title);
  }
  const previewCount = (templateBlock.match(/previewUrl:/g) ?? []).length;
  assert.ok(previewCount >= 12, "only " + previewCount + " template preview images found");
});
