(function attachLayoutReviewCore(root) {
  "use strict";

  const KNOWN_LABELS = [
    { test: ({ id }) => id === "selector", label: "Package Selector" },
    { test: ({ id }) => id === "checkout", label: "Checkout" },
    {
      test: ({ heading, text }) => /দৈনন্দিন কোমল যত্ন|baby care combo/i.test(`${heading} ${text}`),
      label: "Hero",
    },
    {
      test: ({ heading, text }) => /উপাদান|ingredients/i.test(`${heading} ${text}`),
      label: "Ingredients",
    },
    {
      test: ({ heading, text }) => /উপকারিতা|বৈশিষ্ট্য|benefits/i.test(`${heading} ${text}`),
      label: "Benefits",
    },
    {
      test: ({ heading, text }) => /ব্যবহারবিধি|how to use/i.test(`${heading} ${text}`),
      label: "How to Use",
    },
    {
      test: ({ heading, text }) => /frequently asked|faq|প্রশ্ন/i.test(`${heading} ${text}`),
      label: "FAQ",
    },
    {
      test: ({ heading, text }) => /review|গ্রাহক.*মতামত|অভিজ্ঞতা/i.test(`${heading} ${text}`),
      label: "Reviews",
    },
    {
      test: ({ heading, text }) => /evidence|lab|certificate|সার্টিফিকেট|ল্যাব/i.test(`${heading} ${text}`),
      label: "Evidence",
    },
  ];

  function compactText(value, maxLength = 52) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    return normalized.length > maxLength
      ? `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
      : normalized;
  }

  function deriveSectionLabel({ id = "", heading = "", text = "", index = 0 }) {
    const context = {
      id: String(id || "").trim().toLowerCase(),
      heading: compactText(heading, 72),
      text: compactText(text, 140),
    };

    for (const rule of KNOWN_LABELS) {
      if (rule.test(context)) return rule.label;
    }

    if (context.heading) return context.heading;
    if (context.id) return compactText(context.id.replace(/[-_]+/g, " "), 52);
    if (context.text) return context.text;
    return `Section ${index + 1}`;
  }

  function moveItem(items, fromIndex, toIndex) {
    if (!Array.isArray(items)) return [];
    const next = items.slice();
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= next.length ||
      toIndex >= next.length ||
      fromIndex === toIndex
    ) {
      return next;
    }

    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    return next;
  }

  function formatReviewSummary(sections) {
    const visible = sections.filter((section) => !section.hidden);
    const hidden = sections.filter((section) => section.hidden);
    const orderLine = visible.map((section) => section.label).join(" → ") || "(none)";

    const lines = ["Layout Review Mode — Approved Section Order", "", orderLine];
    if (hidden.length) {
      lines.push("", "Hidden sections:");
      hidden.forEach((section) => lines.push(`- ${section.label}`));
    }
    return lines.join("\n");
  }

  const api = {
    compactText,
    deriveSectionLabel,
    moveItem,
    formatReviewSummary,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.LayoutReviewCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
