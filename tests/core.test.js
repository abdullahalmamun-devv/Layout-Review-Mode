const test = require("node:test");
const assert = require("node:assert/strict");
const {
  compactText,
  deriveSectionLabel,
  moveItem,
  formatReviewSummary,
} = require("../src/core.js");

test("compactText normalizes whitespace and truncates", () => {
  assert.equal(compactText("  hello   world  "), "hello world");
  assert.equal(compactText("abcdefgh", 6), "abcde…");
});

test("deriveSectionLabel recognizes key PuraMini sections", () => {
  assert.equal(deriveSectionLabel({ id: "selector", index: 0 }), "Package Selector");
  assert.equal(deriveSectionLabel({ id: "checkout", index: 0 }), "Checkout");
  assert.equal(
    deriveSectionLabel({ heading: "উপাদান ও গুণাগুণ", index: 0 }),
    "Ingredients",
  );
});

test("deriveSectionLabel falls back to heading or generated section number", () => {
  assert.equal(deriveSectionLabel({ heading: "Custom Section", index: 2 }), "Custom Section");
  assert.equal(deriveSectionLabel({ index: 2 }), "Section 3");
});

test("moveItem returns reordered copy without mutating input", () => {
  const input = ["a", "b", "c"];
  const result = moveItem(input, 0, 2);
  assert.deepEqual(result, ["b", "c", "a"]);
  assert.deepEqual(input, ["a", "b", "c"]);
});

test("formatReviewSummary separates hidden sections", () => {
  const output = formatReviewSummary([
    { label: "Hero", hidden: false },
    { label: "Trust", hidden: true },
    { label: "Checkout", hidden: false },
  ]);
  assert.match(output, /Hero → Checkout/);
  assert.match(output, /Hidden sections:\n- Trust/);
});
