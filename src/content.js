(function layoutReviewMode() {
  "use strict";

  if (window.top !== window.self) return;
  if (!globalThis.LayoutReviewCore) return;

  const { deriveSectionLabel, moveItem, formatReviewSummary } = globalThis.LayoutReviewCore;
  const ROOT_ID = "layout-review-mode-root";
  const SUPPORTED_HOST = "staging.puramini.care";

  const state = {
    initialized: false,
    panelVisible: false,
    container: null,
    sections: [],
    originalSections: [],
    shadow: null,
    panelHost: null,
    draggedId: null,
    highlighted: null,
  };

  function isElement(value) {
    return value instanceof HTMLElement;
  }

  function isAuxiliaryOverlay(element) {
    if (!isElement(element)) return true;
    if (element.id === ROOT_ID) return true;
    if (element.matches('[role="dialog"], [aria-modal="true"]')) return true;
    if (element.querySelector(':scope > [role="dialog"], :scope > [aria-modal="true"]')) return true;

    const style = window.getComputedStyle(element);
    if (style.position === "fixed" || style.position === "absolute") return true;

    const marker = `${element.id} ${element.className}`.toLowerCase();
    if (/modal|dialog|toast|sticky.*cta|floating/.test(marker)) return true;

    return false;
  }

  function looksLikeSection(element) {
    if (!isElement(element) || isAuxiliaryOverlay(element)) return false;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(element.tagName)) return false;

    if (element.tagName === "SECTION" || element.tagName === "ARTICLE") return true;
    if (element.id === "selector" || element.id === "checkout") return true;
    if (element.querySelector("h1, h2, h3")) return true;

    const rect = element.getBoundingClientRect();
    return rect.height >= 100 && element.innerText.trim().length >= 20;
  }

  function sectionDescriptor(element, index) {
    const heading = element.querySelector("h1, h2, h3")?.textContent || "";
    const text = element.innerText || "";
    const generatedId = `lrm-section-${index}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      id: generatedId,
      element,
      label: deriveSectionLabel({
        id: element.id,
        heading,
        text,
        index,
      }),
      hidden: false,
      originalIndex: index,
      originalOrder: element.style.order,
      originalOrderPriority: element.style.getPropertyPriority("order"),
      originalDisplay: element.style.display,
      originalDisplayPriority: element.style.getPropertyPriority("display"),
    };
  }

  function discoverSections() {
    const container = document.querySelector("main");
    if (!container) return { container: null, sections: [] };

    const children = Array.from(container.children).filter(looksLikeSection);
    return {
      container,
      sections: children.map(sectionDescriptor),
    };
  }

  function restoreProperty(element, property, value, priority) {
    if (!value) {
      element.style.removeProperty(property);
      return;
    }
    element.style.setProperty(property, value, priority || "");
  }

  function restoreAllStyles() {
    for (const section of state.originalSections) {
      if (!section.element.isConnected) continue;
      restoreProperty(
        section.element,
        "order",
        section.originalOrder,
        section.originalOrderPriority,
      );
      restoreProperty(
        section.element,
        "display",
        section.originalDisplay,
        section.originalDisplayPriority,
      );
    }
    clearHighlight();
  }

  function applyLayout() {
    state.sections.forEach((section, index) => {
      if (!section.element.isConnected) return;
      section.element.style.setProperty("order", String(index), "important");
      if (section.hidden) {
        section.element.style.setProperty("display", "none", "important");
      } else {
        restoreProperty(
          section.element,
          "display",
          section.originalDisplay,
          section.originalDisplayPriority,
        );
      }
    });
  }

  function resetLayout() {
    restoreAllStyles();
    state.sections = state.originalSections.map((section) => ({ ...section, hidden: false }));
    renderPanel();
  }

  function refreshDiscovery() {
    restoreAllStyles();
    const discovered = discoverSections();
    state.container = discovered.container;
    state.sections = discovered.sections;
    state.originalSections = discovered.sections.map((section) => ({ ...section }));
    renderPanel();
  }

  function moveSection(sectionId, delta) {
    const fromIndex = state.sections.findIndex((section) => section.id === sectionId);
    const toIndex = Math.min(
      Math.max(fromIndex + delta, 0),
      Math.max(state.sections.length - 1, 0),
    );
    if (fromIndex < 0 || fromIndex === toIndex) return;
    state.sections = moveItem(state.sections, fromIndex, toIndex);
    applyLayout();
    renderPanel();
  }

  function toggleSection(sectionId) {
    const section = state.sections.find((item) => item.id === sectionId);
    if (!section) return;
    section.hidden = !section.hidden;
    applyLayout();
    renderPanel();
  }

  function reorderByIds(ids) {
    const byId = new Map(state.sections.map((section) => [section.id, section]));
    const next = ids.map((id) => byId.get(id)).filter(Boolean);
    if (next.length !== state.sections.length) return;
    state.sections = next;
    applyLayout();
  }

  function clearHighlight() {
    const item = state.highlighted;
    if (!item) return;
    const { element, outline, outlineOffset, boxShadow } = item;
    if (element?.isConnected) {
      element.style.outline = outline;
      element.style.outlineOffset = outlineOffset;
      element.style.boxShadow = boxShadow;
    }
    state.highlighted = null;
  }

  function highlightSection(section) {
    clearHighlight();
    if (!section?.element?.isConnected || section.hidden) return;
    const element = section.element;
    state.highlighted = {
      element,
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
      boxShadow: element.style.boxShadow,
    };
    element.style.outline = "3px solid #0284c7";
    element.style.outlineOffset = "-3px";
    element.style.boxShadow = "0 0 0 4px rgba(2,132,199,.14)";
  }

  function scrollToSection(section) {
    if (!section || section.hidden || !section.element.isConnected) return;
    section.element.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightSection(section);
    window.setTimeout(clearHighlight, 1400);
  }

  async function copySummary() {
    const summary = formatReviewSummary(state.sections);
    try {
      await navigator.clipboard.writeText(summary);
      flashStatus("Approved order copied");
      return;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = summary;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      flashStatus("Approved order copied");
    }
  }

  function flashStatus(message) {
    const status = state.shadow?.querySelector("[data-lrm-status]");
    if (!status) return;
    const previous = status.textContent;
    status.textContent = message;
    status.dataset.flash = "true";
    window.setTimeout(() => {
      if (!status.isConnected) return;
      status.textContent = previous;
      delete status.dataset.flash;
    }, 1600);
  }

  function makeButton(label, action, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `lrm-button ${extraClass}`.trim();
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  function buildRow(section, index) {
    const row = document.createElement("div");
    row.className = `lrm-row${section.hidden ? " is-hidden" : ""}`;
    row.draggable = true;
    row.dataset.sectionId = section.id;

    const handle = document.createElement("div");
    handle.className = "lrm-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.textContent = "⋮⋮";

    const number = document.createElement("div");
    number.className = "lrm-number";
    number.textContent = String(index + 1);

    const name = document.createElement("button");
    name.type = "button";
    name.className = "lrm-name";
    name.textContent = section.label;
    name.title = "Scroll to and highlight this section";
    name.addEventListener("click", () => scrollToSection(section));
    name.addEventListener("mouseenter", () => highlightSection(section));
    name.addEventListener("mouseleave", clearHighlight);

    const controls = document.createElement("div");
    controls.className = "lrm-row-controls";
    controls.append(
      makeButton("↑", () => moveSection(section.id, -1), "icon"),
      makeButton("↓", () => moveSection(section.id, 1), "icon"),
      makeButton(section.hidden ? "Show" : "Hide", () => toggleSection(section.id), "visibility"),
    );

    row.append(handle, number, name, controls);

    row.addEventListener("dragstart", (event) => {
      state.draggedId = section.id;
      row.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", section.id);
    });

    row.addEventListener("dragend", () => {
      state.draggedId = null;
      row.classList.remove("is-dragging");
      state.shadow?.querySelectorAll(".lrm-row").forEach((item) => item.classList.remove("drop-before", "drop-after"));
    });

    row.addEventListener("dragover", (event) => {
      if (!state.draggedId || state.draggedId === section.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      row.classList.toggle("drop-before", before);
      row.classList.toggle("drop-after", !before);
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drop-before", "drop-after");
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = state.draggedId || event.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === section.id) return;

      const ids = state.sections.map((item) => item.id);
      const fromIndex = ids.indexOf(draggedId);
      const targetIndex = ids.indexOf(section.id);
      if (fromIndex < 0 || targetIndex < 0) return;

      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      const [moved] = ids.splice(fromIndex, 1);
      let insertionIndex = ids.indexOf(section.id);
      if (!before) insertionIndex += 1;
      ids.splice(insertionIndex, 0, moved);
      reorderByIds(ids);
      renderPanel();
    });

    return row;
  }

  function ensurePanelHost() {
    if (state.panelHost?.isConnected) return;

    const host = document.createElement("div");
    host.id = ROOT_ID;
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.top = "16px";
    host.style.right = "16px";
    host.style.width = "min(380px, calc(100vw - 24px))";
    host.style.maxHeight = "calc(100vh - 32px)";
    host.style.pointerEvents = "auto";

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .panel {
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #17202a;
          background: rgba(255,255,255,.98);
          border: 1px solid rgba(15,23,42,.12);
          border-radius: 18px;
          box-shadow: 0 24px 70px rgba(15,23,42,.22);
          overflow: hidden;
          backdrop-filter: blur(18px);
        }
        .header { padding: 14px 14px 11px; border-bottom: 1px solid #e8edf2; }
        .title-line { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .title { font-size:14px; line-height:1.2; font-weight:750; letter-spacing:-.01em; }
        .badge { font-size:10px; font-weight:700; color:#075985; background:#e0f2fe; border:1px solid #bae6fd; border-radius:999px; padding:4px 7px; white-space:nowrap; }
        .subtitle { margin-top:5px; color:#667085; font-size:11px; line-height:1.45; }
        .toolbar { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:7px; padding:10px 12px; border-bottom:1px solid #edf0f3; }
        button { font: inherit; }
        .lrm-button { border:1px solid #dbe1e7; background:#fff; color:#344054; border-radius:10px; padding:8px 9px; cursor:pointer; font-size:11px; font-weight:650; transition:.15s ease; }
        .lrm-button:hover { border-color:#93c5fd; background:#f8fbff; color:#075985; }
        .lrm-button:active { transform:translateY(1px); }
        .lrm-button.primary { background:#0284c7; border-color:#0284c7; color:#fff; }
        .lrm-button.primary:hover { background:#0369a1; color:#fff; }
        .lrm-button.danger { color:#b42318; }
        .status { padding:8px 12px; font-size:10.5px; color:#667085; background:#fafbfc; border-bottom:1px solid #edf0f3; display:flex; justify-content:space-between; gap:8px; }
        .status[data-flash="true"] { color:#027a48; font-weight:700; }
        .list { max-height:min(58vh, 580px); overflow:auto; padding:8px; }
        .empty { padding:24px 14px; text-align:center; color:#667085; font-size:12px; line-height:1.5; }
        .lrm-row { position:relative; display:grid; grid-template-columns:18px 25px minmax(0,1fr) auto; align-items:center; gap:7px; min-height:47px; padding:6px 7px; border:1px solid transparent; border-radius:11px; background:#fff; }
        .lrm-row + .lrm-row { margin-top:4px; }
        .lrm-row:hover { background:#f8fafc; border-color:#edf1f4; }
        .lrm-row.is-hidden { opacity:.5; background:#f9fafb; }
        .lrm-row.is-dragging { opacity:.38; }
        .lrm-row.drop-before::before, .lrm-row.drop-after::after { content:""; position:absolute; left:8px; right:8px; height:2px; border-radius:2px; background:#0284c7; }
        .lrm-row.drop-before::before { top:-3px; }
        .lrm-row.drop-after::after { bottom:-3px; }
        .lrm-handle { color:#98a2b3; cursor:grab; font-weight:900; user-select:none; letter-spacing:-3px; transform:translateX(-2px); }
        .lrm-handle:active { cursor:grabbing; }
        .lrm-number { width:23px; height:23px; border-radius:7px; display:grid; place-items:center; background:#f2f4f7; color:#667085; font-size:10px; font-weight:750; }
        .lrm-name { border:0; background:transparent; padding:5px 1px; min-width:0; text-align:left; color:#1d2939; font-size:11.5px; font-weight:650; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .lrm-name:hover { color:#0369a1; }
        .lrm-row-controls { display:flex; gap:4px; }
        .lrm-row-controls .lrm-button { padding:5px 6px; border-radius:8px; font-size:10px; min-width:28px; }
        .lrm-row-controls .visibility { min-width:39px; }
        .footer { padding:10px 12px 12px; border-top:1px solid #edf0f3; display:grid; grid-template-columns:1fr 1fr; gap:7px; }
        .hint { grid-column:1/-1; color:#98a2b3; font-size:9.5px; line-height:1.4; text-align:center; padding-top:2px; }
        @media (max-width: 520px) {
          .toolbar { grid-template-columns:1fr 1fr; }
          .toolbar .copy { grid-column:1/-1; }
          .lrm-row { grid-template-columns:16px 23px minmax(0,1fr) auto; gap:5px; }
          .lrm-row-controls .icon { display:none; }
        }
      </style>
      <div class="panel">
        <div class="header">
          <div class="title-line">
            <div class="title">Layout Review Mode</div>
            <div class="badge">PREVIEW ONLY</div>
          </div>
          <div class="subtitle">Drag sections to compare layouts. Nothing is saved to the website.</div>
        </div>
        <div class="toolbar" data-lrm-toolbar></div>
        <div class="status"><span data-lrm-status></span><span>staging only</span></div>
        <div class="list" data-lrm-list></div>
        <div class="footer" data-lrm-footer></div>
      </div>
    `;

    document.documentElement.appendChild(host);
    state.panelHost = host;
    state.shadow = shadow;
  }

  function renderPanel() {
    if (!state.shadow) return;

    const toolbar = state.shadow.querySelector("[data-lrm-toolbar]");
    const list = state.shadow.querySelector("[data-lrm-list]");
    const footer = state.shadow.querySelector("[data-lrm-footer]");
    const status = state.shadow.querySelector("[data-lrm-status]");
    if (!toolbar || !list || !footer || !status) return;

    toolbar.replaceChildren(
      makeButton("Refresh", refreshDiscovery),
      makeButton("Reset", resetLayout, "danger"),
      makeButton("Copy order", copySummary, "primary copy"),
    );

    status.textContent = `${state.sections.length} section${state.sections.length === 1 ? "" : "s"} detected`;
    list.replaceChildren();

    if (!state.sections.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No reviewable storefront sections were detected. Reload the staging page after it finishes rendering, then try Refresh.";
      list.appendChild(empty);
    } else {
      state.sections.forEach((section, index) => list.appendChild(buildRow(section, index)));
    }

    footer.replaceChildren(
      makeButton("Presentation mode", hidePanel),
      makeButton("Reset + close", () => {
        resetLayout();
        hidePanel();
      }),
    );
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Refresh the webpage to discard the session automatically.";
    footer.appendChild(hint);
  }

  function initialize() {
    if (state.initialized) return;
    const discovered = discoverSections();
    state.container = discovered.container;
    state.sections = discovered.sections;
    state.originalSections = discovered.sections.map((section) => ({ ...section }));
    state.initialized = true;
    ensurePanelHost();
    renderPanel();
  }

  function showPanel() {
    initialize();
    ensurePanelHost();
    state.panelHost.style.display = "block";
    state.panelVisible = true;
    renderPanel();
  }

  function hidePanel() {
    clearHighlight();
    if (state.panelHost) state.panelHost.style.display = "none";
    state.panelVisible = false;
  }

  function togglePanel() {
    if (location.hostname !== SUPPORTED_HOST) return;
    if (!state.initialized || !state.panelVisible) {
      showPanel();
    } else {
      hidePanel();
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "LAYOUT_REVIEW_TOGGLE_PANEL") {
      togglePanel();
    }
  });
})();
