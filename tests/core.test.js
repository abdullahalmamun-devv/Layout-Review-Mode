const test = require("node:test");
const assert = require("node:assert/strict");
const {
  compactText,
  identifySection,
  deriveSectionLabel,
  moveItem,
  reconcileSections,
  isSupportedLocation,
  formatReviewSummary,
} = require("../src/core.js");

test("compactText normalizes whitespace and truncates", () => {
  assert.equal(compactText("  hello   world  "), "hello world");
  assert.equal(compactText("abcdefgh", 6), "abcde…");
});

test("identifySection recognizes stable PuraMini section identities", () => {
  assert.deepEqual(identifySection({ id: "selector" }), {
    key: "package-selector",
    label: "Package Selector",
  });
  assert.deepEqual(identifySection({ id: "checkout" }), {
    key: "checkout",
    label: "Checkout",
  });
  assert.deepEqual(identifySection({ ariaLabel: "উপাদান ও গুণাগুণ" }), {
    key: "ingredients",
    label: "Ingredients",
  });
});

test("Trust is distinct from Evidence even when trust body text mentions labs", () => {
  const trust = identifySection({
    ariaLabel: "নিরাপত্তা ও গুণগত মান",
    text: "USFDA ISO আন্তর্জাতিক ল্যাব ফর্মুলা BCSIR Science Lab Tested",
  });
  const evidence = identifySection({
    ariaLabel: "ল্যাব ডকুমেন্ট ও সার্টিফিকেট",
    heading: "প্রমাণ ও ল্যাব ডকুমেন্ট",
  });

  assert.deepEqual(trust, { key: "trust", label: "Trust" });
  assert.deepEqual(evidence, { key: "evidence", label: "Evidence" });
});

test("Parent Concern gets a stable explicit identity", () => {
  assert.deepEqual(
    identifySection({
      ariaLabel: "অভিভাবকের নির্ভরতা ও যত্ন",
      heading: "শিশুর সূক্ষ্ম ত্বকে দরকার কোমল, নিরাপদ পুষ্টি",
    }),
    { key: "parent-concern", label: "Parent Concern" },
  );
});

test("deriveSectionLabel remains backwards compatible", () => {
  assert.equal(deriveSectionLabel({ id: "selector" }), "Package Selector");
  assert.equal(deriveSectionLabel({ heading: "Custom Section", index: 2 }), "Custom Section");
});

test("unknown sections receive deterministic custom keys", () => {
  const a = identifySection({ heading: "Custom Section" });
  const b = identifySection({ heading: "Custom Section" });
  assert.equal(a.key, b.key);
  assert.equal(a.label, "Custom Section");
  assert.match(a.key, /^custom-/);
});

test("moveItem returns reordered copy without mutating input", () => {
  const input = ["a", "b", "c"];
  const result = moveItem(input, 0, 2);
  assert.deepEqual(result, ["b", "c", "a"]);
  assert.deepEqual(input, ["a", "b", "c"]);
});

test("reconcileSections preserves operator order and hidden state when Checkout mounts late", () => {
  const current = [
    { key: "hero", label: "Hero", hidden: false, element: "old-hero" },
    { key: "package-selector", label: "Package Selector", hidden: false, element: "old-selector" },
    { key: "trust", label: "Trust", hidden: true, element: "old-trust" },
    { key: "ingredients", label: "Ingredients", hidden: false, element: "old-ingredients" },
  ];
  const discovered = [
    { key: "hero", label: "Hero", element: "new-hero" },
    { key: "trust", label: "Trust", element: "new-trust" },
    { key: "package-selector", label: "Package Selector", element: "new-selector" },
    { key: "ingredients", label: "Ingredients", element: "new-ingredients" },
    { key: "checkout", label: "Checkout", element: "new-checkout" },
  ];

  const result = reconcileSections(current, discovered);
  assert.deepEqual(
    result.map((section) => section.key),
    ["hero", "package-selector", "trust", "ingredients", "checkout"],
  );
  assert.equal(result.find((section) => section.key === "trust").hidden, true);
  assert.equal(result.find((section) => section.key === "checkout").hidden, false);
  assert.equal(result.find((section) => section.key === "hero").element, "new-hero");
});

test("reconcileSections removes disappeared sections and adopts replacement references", () => {
  const current = [
    { key: "hero", label: "Hero", hidden: false, element: "old-hero" },
    { key: "reviews", label: "Reviews", hidden: true, element: "old-reviews" },
  ];
  const discovered = [{ key: "hero", label: "Hero", element: "replacement-hero" }];
  const result = reconcileSections(current, discovered);

  assert.deepEqual(result.map((section) => section.key), ["hero"]);
  assert.equal(result[0].element, "replacement-hero");
});

test("root staging homepage is the only supported route", () => {
  assert.equal(
    isSupportedLocation({ hostname: "staging.puramini.care", pathname: "/" }),
    true,
  );
  assert.equal(
    isSupportedLocation({ hostname: "staging.puramini.care", pathname: "/privacy" }),
    false,
  );
  assert.equal(
    isSupportedLocation({ hostname: "staging.puramini.care", pathname: "/order-received/test" }),
    false,
  );
  assert.equal(isSupportedLocation({ hostname: "puramini.care", pathname: "/" }), false);
});

test("formatReviewSummary exports stable keys, URL, current order and hidden sections", () => {
  const output = formatReviewSummary(
    [
      { key: "hero", label: "Hero", hidden: false },
      { key: "trust", label: "Trust", hidden: true },
      { key: "checkout", label: "Checkout", hidden: false },
    ],
    "https://staging.puramini.care/",
  );

  assert.match(output, /URL: https:\/\/staging\.puramini\.care\//);
  assert.match(output, /1\. hero — Hero/);
  assert.match(output, /2\. checkout — Checkout/);
  assert.match(output, /Hidden sections:\n- trust — Trust/);
  assert.match(output, /visual preview order only/i);
});
