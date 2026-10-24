(function attachLayoutReviewCore(root) {
  "use strict";

  const SECTION_RULES = [
    {
      key: "package-selector",
      label: "Package Selector",
      test: ({ id }) => id === "selector",
    },
    {
      key: "checkout",
      label: "Checkout",
      test: ({ id }) => id === "checkout",
    },
    {
      key: "trust",
      label: "Trust",
      test: ({ ariaLabel }) => /নিরাপত্তা ও গুণগত মান|quality.*trust|trust/i.test(ariaLabel),
    },
    {
      key: "parent-concern",
      label: "Parent Concern",
      test: ({ ariaLabel, heading }) =>
        /অভিভাবকের নির্ভরতা ও যত্ন|অভিভাবকের মানসিক প্রশান্তি|শিশুর সূক্ষ্ম ত্বকে/i.test(
          `${ariaLabel} ${heading}`,
        ),
    },
    {
      key: "ingredients",
      label: "Ingredients",
      test: ({ ariaLabel, heading }) => /উপাদান ও গুণাগুণ|ingredients/i.test(`${ariaLabel} ${heading}`),
    },
    {
      key: "benefits",
      label: "Benefits",
      test: ({ ariaLabel, heading }) => /উপকারিতা|বৈশিষ্ট্য|benefits/i.test(`${ariaLabel} ${heading}`),
    },
    {
      key: "how-to-use",
      label: "How to Use",
      test: ({ ariaLabel, heading }) => /ব্যবহারবিধি|how to use/i.test(`${ariaLabel} ${heading}`),
    },
    {
      key: "reviews",
      label: "Reviews",
      test: ({ ariaLabel, heading }) => /review|গ্রাহক.*মতামত|অভিজ্ঞতা/i.test(`${ariaLabel} ${heading}`),
    },
    {
      key: "evidence",
      label: "Evidence",
      test: ({ ariaLabel, heading }) =>
        /evidence|lab documents?|certificates?|সার্টিফিকেট|ল্যাব ডকুমেন্ট|প্রমাণ/i.test(
          `${ariaLabel} ${heading}`,
        ),
    },
    {
      key: "faq",
      label: "FAQ",
      test: ({ ariaLabel, heading }) => /frequently asked|faq|প্রশ্ন|জিজ্ঞাস/i.test(`${ariaLabel} ${heading}`),
    },
    {
      key: "hero",
      label: "Hero",
      test: ({ heading, text }) => /শিশুর দৈনন্দিন কোমল যত্ন|baby care combo/i.test(`${heading} ${text}`),
    },
  ];

  function compactText(value, maxLength = 52) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    return normalized.length > maxLength
      ? `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
      : normalized;
  }

  function stableHash(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function identifySection({ id = "", ariaLabel = "", heading = "", text = "", index = 0 }) {
    const context = {
      id: String(id || "").trim().toLowerCase(),
      ariaLabel: compactText(ariaLabel, 96),
      heading: compactText(heading, 96),
      text: compactText(text, 180),
    };

    for (const rule of SECTION_RULES) {
      if (rule.test(context)) {
        return { key: rule.key, label: rule.label };
      }
    }

    const readable = context.heading || context.ariaLabel || context.id.replace(/[-_]+/g, " ") || context.text;
    const label = compactText(readable, 52) || `Section ${index + 1}`;
    const marker = context.id || context.ariaLabel || context.heading || context.text || `section-${index + 1}`;
    const slug = slugify(marker);
    return {
      key: `custom-${slug || stableHash(marker)}-${stableHash(marker)}`,
      label,
    };
  }

  function deriveSectionLabel(input) {
    return identifySection(input).label;
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

  function reconcileSections(currentSections, discoveredSections) {
    const current = Array.isArray(currentSections) ? currentSections : [];
    const discovered = Array.isArray(discoveredSections) ? discoveredSections : [];
    const discoveredByKey = new Map(discovered.map((section) => [section.key, section]));

    const next = current
      .filter((section) => discoveredByKey.has(section.key))
      .map((section) => ({
        ...discoveredByKey.get(section.key),
        hidden: Boolean(section.hidden),
      }));

    const present = new Set(next.map((section) => section.key));
    const sourceKeys = discovered.map((section) => section.key);

    discovered.forEach((section, sourceIndex) => {
      if (present.has(section.key)) return;

      let insertionIndex = -1;
      for (let i = sourceIndex - 1; i >= 0; i -= 1) {
        const predecessorIndex = next.findIndex((item) => item.key === sourceKeys[i]);
        if (predecessorIndex >= 0) {
          insertionIndex = predecessorIndex + 1;
          break;
        }
      }

      if (insertionIndex < 0) {
        for (let i = sourceIndex + 1; i < sourceKeys.length; i += 1) {
          const successorIndex = next.findIndex((item) => item.key === sourceKeys[i]);
          if (successorIndex >= 0) {
            insertionIndex = successorIndex;
            break;
          }
        }
      }

      if (insertionIndex < 0) insertionIndex = next.length;
      next.splice(insertionIndex, 0, { ...section, hidden: false });
      present.add(section.key);
    });

    return next;
  }

  function isSupportedLocation({ hostname = "", pathname = "" }) {
    return hostname === "staging.puramini.care" && pathname === "/";
  }

  function formatReviewSummary(sections, pageUrl = "") {
    const list = Array.isArray(sections) ? sections : [];
    const visible = list.filter((section) => !section.hidden);
    const hidden = list.filter((section) => section.hidden);

    const lines = ["Layout Review Mode — Approved Section Order"];
    if (pageUrl) lines.push(`URL: ${pageUrl}`);
    lines.push("");

    if (visible.length) {
      visible.forEach((section, index) => {
        lines.push(`${index + 1}. ${section.key || "unknown"} — ${section.label}`);
      });
    } else {
      lines.push("(no visible sections)");
    }

    if (hidden.length) {
      lines.push("", "Hidden sections:");
      hidden.forEach((section) => lines.push(`- ${section.key || "unknown"} — ${section.label}`));
    }

    lines.push(
      "",
      "Note: this is a visual preview order only. Implement the approved order later in React source order and re-test accessibility.",
    );

    return lines.join("\n");
  }

  const api = {
    compactText,
    identifySection,
    deriveSectionLabel,
    moveItem,
    reconcileSections,
    isSupportedLocation,
    formatReviewSummary,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.LayoutReviewCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
