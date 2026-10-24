(function layoutReviewMode() {
  "use strict";

  if (window.top !== window.self || !globalThis.LayoutReviewCore) return;

  const {
    identifySection,
    moveItem,
    reconcileSections,
    isSupportedLocation,
    formatReviewSummary,
  } = globalThis.LayoutReviewCore;

  const ROOT_ID = "layout-review-mode-root";
  const state = {
    initialized: false,
    panelVisible: false,
    layoutActive: false,
    container: null,
    sections: [],
    baseline: [],
    host: null,
    shadow: null,
    draggedKey: null,
    highlighted: null,
    reconcileTimer: null,
  };

  const supportedRoute = () =>
    isSupportedLocation({ hostname: location.hostname, pathname: location.pathname });

  function isElement(value) {
    return value instanceof HTMLElement;
  }

  function restoreProperty(element, property, value, priority) {
    if (!value) element.style.removeProperty(property);
    else element.style.setProperty(property, value, priority || "");
  }

  function isAuxiliary(element) {
    if (!isElement(element) || element.id === ROOT_ID) return true;
    if (element.matches('[role="dialog"], [aria-modal="true"]')) return true;
    if (element.querySelector(':scope > [role="dialog"], :scope > [aria-modal="true"]')) return true;
    const style = getComputedStyle(element);
    if (style.position === "fixed" || style.position === "absolute") return true;
    return /modal|dialog|toast|sticky.*cta|floating/i.test(`${element.id} ${element.className}`);
  }

  function looksLikeSection(element) {
    if (!isElement(element) || isAuxiliary(element)) return false;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(element.tagName)) return false;
    if (element.tagName === "SECTION" || element.tagName === "ARTICLE") return true;
    if (element.id === "selector" || element.id === "checkout") return true;
    if (element.querySelector("h1,h2,h3")) return true;
    const rect = element.getBoundingClientRect();
    return rect.height >= 100 && element.innerText.trim().length >= 20;
  }

  function descriptor(element, sourceIndex) {
    const identity = identifySection({
      id: element.id,
      ariaLabel: element.getAttribute("aria-label") || "",
      heading: element.querySelector("h1,h2,h3")?.textContent || "",
      text: element.innerText || "",
      index: sourceIndex,
    });
    return {
      key: identity.key,
      label: identity.label,
      element,
      hidden: false,
      sourceIndex,
      originalOrder: element.style.order,
      originalOrderPriority: element.style.getPropertyPriority("order"),
      originalDisplay: element.style.display,
      originalDisplayPriority: element.style.getPropertyPriority("display"),
    };
  }

  function uniqueKeys(items) {
    const counts = new Map();
    return items.map((item) => {
      const n = (counts.get(item.key) || 0) + 1;
      counts.set(item.key, n);
      return n === 1 ? item : { ...item, key: `${item.key}--${n}`, label: `${item.label} (${n})` };
    });
  }

  function discover() {
    const container = document.querySelector("main");
    if (!container) return { compatible: false, container: null, sections: [] };
    const style = getComputedStyle(container);
    const sections = uniqueKeys(Array.from(container.children).filter(looksLikeSection).map(descriptor));
    const keys = new Set(sections.map((item) => item.key));
    return {
      container,
      sections,
      compatible:
        style.display === "flex" &&
        style.flexDirection === "column" &&
        keys.has("hero") &&
        keys.has("package-selector"),
    };
  }

  function restoreSection(section) {
    if (!section?.element?.isConnected) return;
    restoreProperty(section.element, "order", section.originalOrder, section.originalOrderPriority);
    restoreProperty(section.element, "display", section.originalDisplay, section.originalDisplayPriority);
  }

  function restoreAll() {
    const seen = new Set();
    [...state.baseline, ...state.sections].forEach((section) => {
      if (!section?.element || seen.has(section.element)) return;
      seen.add(section.element);
      restoreSection(section);
    });
    clearHighlight();
  }

  function refreshGeometry() {
    requestAnimationFrame(() => dispatchEvent(new Event("scroll")));
  }

  function applyLayout() {
    state.sections.forEach((section, index) => {
      if (!section.element.isConnected) return;
      section.element.style.setProperty("order", String(index), "important");
      if (section.hidden) section.element.style.setProperty("display", "none", "important");
      else restoreProperty(section.element, "display", section.originalDisplay, section.originalDisplayPriority);
    });
    refreshGeometry();
  }

  function normalizedBaseline(discovered) {
    const previous = new Map(state.baseline.map((item) => [item.key, item]));
    return discovered.map((item) => {
      const old = previous.get(item.key);
      if (!old || old.element !== item.element) return { ...item, hidden: false };
      return {
        ...item,
        hidden: false,
        originalOrder: old.originalOrder,
        originalOrderPriority: old.originalOrderPriority,
        originalDisplay: old.originalDisplay,
        originalDisplayPriority: old.originalDisplayPriority,
      };
    });
  }

  function reconcile({ render = true } = {}) {
    if (!supportedRoute()) {
      if (state.initialized) deactivate();
      return false;
    }
    const found = discover();
    if (!found.compatible) {
      if (state.initialized) deactivate();
      return false;
    }

    const nextBaseline = normalizedBaseline(found.sections);
    const nextByKey = new Map(nextBaseline.map((item) => [item.key, item]));
    state.baseline.forEach((old) => {
      const next = nextByKey.get(old.key);
      if (!next || next.element !== old.element) restoreSection(old);
    });

    state.container = found.container;
    state.sections = state.sections.length
      ? reconcileSections(state.sections, nextBaseline)
      : nextBaseline.map((item) => ({ ...item }));
    state.baseline = nextBaseline;

    if (state.layoutActive) applyLayout();
    if (render && state.panelVisible) renderPanel();
    return true;
  }

  function scheduleReconcile() {
    if (!state.initialized || state.reconcileTimer) return;
    state.reconcileTimer = setTimeout(() => {
      state.reconcileTimer = null;
      reconcile();
    }, 30);
  }

  function resetLayout() {
    hideManualCopy();
    reconcile({ render: false });
    restoreAll();
    state.sections = state.baseline.map((item) => ({ ...item, hidden: false }));
    state.layoutActive = false;
    refreshGeometry();
    renderPanel();
  }

  function rescan() {
    hideManualCopy();
    if (reconcile()) flash("Sections rescanned — arrangement preserved", "success");
  }

  function move(sectionKey, delta) {
    hideManualCopy();
    const from = state.sections.findIndex((item) => item.key === sectionKey);
    const to = Math.min(Math.max(from + delta, 0), Math.max(state.sections.length - 1, 0));
    if (from < 0 || from === to) return;
    state.sections = moveItem(state.sections, from, to);
    state.layoutActive = true;
    applyLayout();
    renderPanel({ focusKey: sectionKey, focusAction: delta < 0 ? "up" : "down" });
  }

  function toggleVisibility(sectionKey) {
    hideManualCopy();
    const section = state.sections.find((item) => item.key === sectionKey);
    if (!section) return;
    section.hidden = !section.hidden;
    state.layoutActive = true;
    applyLayout();
    renderPanel({ focusKey: sectionKey, focusAction: "visibility" });
  }

  function reorder(keys) {
    hideManualCopy();
    const byKey = new Map(state.sections.map((item) => [item.key, item]));
    const next = keys.map((key) => byKey.get(key)).filter(Boolean);
    if (next.length !== state.sections.length) return;
    state.sections = next;
    state.layoutActive = true;
    applyLayout();
  }

  function clearHighlight() {
    if (!state.highlighted) return;
    const h = state.highlighted;
    if (h.element?.isConnected) {
      restoreProperty(h.element, "outline", h.outline, h.outlinePriority);
      restoreProperty(h.element, "outline-offset", h.outlineOffset, h.outlineOffsetPriority);
      restoreProperty(h.element, "box-shadow", h.boxShadow, h.boxShadowPriority);
    }
    state.highlighted = null;
  }

  function highlight(section) {
    clearHighlight();
    if (!section?.element?.isConnected || section.hidden) return;
    const e = section.element;
    state.highlighted = {
      element: e,
      outline: e.style.outline,
      outlinePriority: e.style.getPropertyPriority("outline"),
      outlineOffset: e.style.outlineOffset,
      outlineOffsetPriority: e.style.getPropertyPriority("outline-offset"),
      boxShadow: e.style.boxShadow,
      boxShadowPriority: e.style.getPropertyPriority("box-shadow"),
    };
    e.style.setProperty("outline", "3px solid #0284c7", "important");
    e.style.setProperty("outline-offset", "-3px", "important");
    e.style.setProperty("box-shadow", "0 0 0 4px rgba(2,132,199,.14)", "important");
  }

  function goTo(section) {
    if (!section || section.hidden || !section.element.isConnected) return;
    section.element.scrollIntoView({ behavior: "smooth", block: "center" });
    highlight(section);
    setTimeout(clearHighlight, 1400);
  }

  function flash(message, type = "success") {
    const status = state.shadow?.querySelector("[data-status]");
    if (!status) return;
    const previous = status.textContent;
    status.textContent = message;
    status.dataset.flash = type;
    setTimeout(() => {
      if (!status.isConnected) return;
      status.textContent = previous;
      delete status.dataset.flash;
    }, 1800);
  }

  function hideManualCopy() {
    const box = state.shadow?.querySelector("[data-manual-copy]");
    if (!box) return;
    box.hidden = true;
    const textarea = box.querySelector("textarea");
    if (textarea) textarea.value = "";
  }

  function showManualCopy(summary) {
    const box = state.shadow?.querySelector("[data-manual-copy]");
    const textarea = box?.querySelector("textarea");
    if (!box || !textarea) return;
    textarea.value = summary;
    box.hidden = false;
    textarea.focus();
    textarea.select();
  }

  async function copyOrder() {
    reconcile({ render: false });
    const summary = formatReviewSummary(state.sections, location.href);
    hideManualCopy();
    try {
      await navigator.clipboard.writeText(summary);
      flash("Approved order copied", "success");
      return;
    } catch {}

    let temp;
    try {
      temp = document.createElement("textarea");
      temp.value = summary;
      Object.assign(temp.style, { position: "fixed", opacity: "0", pointerEvents: "none" });
      document.body.appendChild(temp);
      temp.focus();
      temp.select();
      const copied = document.execCommand("copy");
      temp.remove();
      temp = null;
      if (copied) {
        flash("Approved order copied", "success");
        return;
      }
    } catch {
    } finally {
      temp?.remove();
    }
    showManualCopy(summary);
    flash("Copy blocked — use the selected text below", "error");
  }

  function button(label, onClick, className = "", options = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `lrm-btn ${className}`.trim();
    b.textContent = label;
    if (options.ariaLabel) b.setAttribute("aria-label", options.ariaLabel);
    if (options.sectionKey) b.dataset.sectionKey = options.sectionKey;
    if (options.action) b.dataset.action = options.action;
    b.addEventListener("click", onClick);
    return b;
  }

  function row(section, index) {
    const el = document.createElement("div");
    el.className = `lrm-row${section.hidden ? " hidden-section" : ""}`;
    el.draggable = true;
    el.dataset.sectionKey = section.key;

    const handle = document.createElement("span");
    handle.className = "handle";
    handle.textContent = "⋮⋮";
    handle.setAttribute("aria-hidden", "true");

    const number = document.createElement("span");
    number.className = "number";
    number.textContent = String(index + 1);

    const name = button(section.label, () => goTo(section), "name", {
      sectionKey: section.key,
      action: "name",
      ariaLabel: `Show ${section.label} on page`,
    });
    name.addEventListener("mouseenter", () => highlight(section));
    name.addEventListener("mouseleave", clearHighlight);

    const controls = document.createElement("span");
    controls.className = "controls";
    controls.append(
      button("↑", () => move(section.key, -1), "icon", {
        ariaLabel: `Move ${section.label} up`, sectionKey: section.key, action: "up",
      }),
      button("↓", () => move(section.key, 1), "icon", {
        ariaLabel: `Move ${section.label} down`, sectionKey: section.key, action: "down",
      }),
      button(section.hidden ? "Show" : "Hide", () => toggleVisibility(section.key), "visibility", {
        ariaLabel: `${section.hidden ? "Show" : "Hide"} ${section.label}`,
        sectionKey: section.key,
        action: "visibility",
      }),
    );
    el.append(handle, number, name, controls);

    el.addEventListener("dragstart", (event) => {
      state.draggedKey = section.key;
      el.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", section.key);
    });
    el.addEventListener("dragend", () => {
      state.draggedKey = null;
      el.classList.remove("dragging");
      state.shadow?.querySelectorAll(".lrm-row").forEach((x) => x.classList.remove("before", "after"));
    });
    el.addEventListener("dragover", (event) => {
      if (!state.draggedKey || state.draggedKey === section.key) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      el.classList.toggle("before", before);
      el.classList.toggle("after", !before);
    });
    el.addEventListener("dragleave", () => el.classList.remove("before", "after"));
    el.addEventListener("drop", (event) => {
      event.preventDefault();
      const dragged = state.draggedKey || event.dataTransfer.getData("text/plain");
      if (!dragged || dragged === section.key) return;
      const keys = state.sections.map((item) => item.key);
      const from = keys.indexOf(dragged);
      if (from < 0) return;
      const rect = el.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      const [moved] = keys.splice(from, 1);
      let at = keys.indexOf(section.key);
      if (!before) at += 1;
      keys.splice(at, 0, moved);
      reorder(keys);
      renderPanel();
    });
    return el;
  }

  function ensurePanel() {
    if (state.host?.isConnected) return;
    const host = document.createElement("div");
    host.id = ROOT_ID;
    Object.assign(host.style, {
      position: "fixed", zIndex: "2147483647", top: "16px", right: "16px",
      width: "min(380px, calc(100vw - 24px))", maxHeight: "calc(100vh - 32px)",
    });
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host{all:initial}*{box-sizing:border-box}.panel{font-family:Inter,system-ui,sans-serif;color:#17202a;background:#fffffff9;border:1px solid #dfe5ea;border-radius:18px;box-shadow:0 24px 70px #0f172a38;overflow:hidden}.header{padding:14px;border-bottom:1px solid #edf0f3}.title{display:flex;justify-content:space-between;gap:10px;font-size:14px;font-weight:750}.badge{font-size:10px;color:#075985;background:#e0f2fe;border:1px solid #bae6fd;border-radius:999px;padding:4px 7px}.subtitle{margin-top:5px;color:#667085;font-size:11px}.toolbar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;padding:10px 12px;border-bottom:1px solid #edf0f3}.lrm-btn{font:650 11px Inter,system-ui,sans-serif;border:1px solid #dbe1e7;background:#fff;color:#344054;border-radius:9px;padding:7px;cursor:pointer}.lrm-btn:hover{border-color:#93c5fd;color:#075985}.lrm-btn:focus-visible,textarea:focus-visible{outline:2px solid #0284c7;outline-offset:2px}.primary{background:#0284c7;border-color:#0284c7;color:#fff}.danger{color:#b42318}.status{padding:8px 12px;font:10.5px Inter,system-ui,sans-serif;color:#667085;background:#fafbfc;border-bottom:1px solid #edf0f3;display:flex;justify-content:space-between;gap:8px}.status[data-flash=success]{color:#027a48;font-weight:700}.status[data-flash=error]{color:#b42318;font-weight:700}.list{max-height:min(55vh,560px);overflow:auto;padding:8px}.lrm-row{position:relative;display:grid;grid-template-columns:18px 24px minmax(0,1fr) auto;align-items:center;gap:6px;padding:6px;border:1px solid transparent;border-radius:10px}.lrm-row+.lrm-row{margin-top:4px}.lrm-row:hover{background:#f8fafc}.hidden-section{opacity:.5}.dragging{opacity:.35}.lrm-row.before:before,.lrm-row.after:after{content:"";position:absolute;left:8px;right:8px;height:2px;background:#0284c7}.before:before{top:-3px}.after:after{bottom:-3px}.handle{color:#98a2b3;cursor:grab;font-weight:900;letter-spacing:-3px}.number{width:22px;height:22px;border-radius:7px;background:#f2f4f7;color:#667085;display:grid;place-items:center;font:700 10px system-ui}.name{border:0;background:transparent;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.controls{display:flex;gap:3px}.controls .lrm-btn{min-width:26px;padding:5px;font-size:10px}.manual{padding:9px 12px;border-top:1px solid #edf0f3;background:#fff8f7}.manual[hidden]{display:none}.manual p{margin:0 0 6px;color:#b42318;font:10px/1.4 system-ui}.manual textarea{width:100%;min-height:82px;border:1px solid #f0b5ae;border-radius:8px;padding:7px;font:10px/1.4 monospace}.footer{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:10px 12px;border-top:1px solid #edf0f3}.hint{grid-column:1/-1;color:#98a2b3;font:9.5px/1.4 system-ui;text-align:center}.empty{padding:22px 12px;text-align:center;color:#667085;font:12px/1.5 system-ui}@media(max-width:520px){.toolbar{grid-template-columns:1fr 1fr}.toolbar .copy{grid-column:1/-1}.controls .lrm-btn{min-width:24px;padding:4px}}
      </style>
      <div class="panel">
        <div class="header"><div class="title"><span>Layout Review Mode</span><span class="badge">PREVIEW ONLY</span></div><div class="subtitle">Drag sections to compare layouts. Nothing is saved.</div></div>
        <div class="toolbar" data-toolbar></div>
        <div class="status"><span data-status></span><span>staging homepage only</span></div>
        <div class="list" data-list></div>
        <div class="manual" data-manual-copy hidden><p>Automatic copy was blocked. Press Ctrl/Cmd+C on the selected text below.</p><textarea readonly aria-label="Approved layout summary"></textarea></div>
        <div class="footer" data-footer></div>
      </div>`;
    document.documentElement.appendChild(host);
    state.host = host;
    state.shadow = shadow;
  }

  function restoreFocus(key, action) {
    if (!key || !action || !state.shadow) return;
    const found = Array.from(state.shadow.querySelectorAll("[data-section-key][data-action]")).find(
      (el) => el.dataset.sectionKey === key && el.dataset.action === action,
    );
    found?.focus();
  }

  function renderPanel({ focusKey = null, focusAction = null } = {}) {
    if (!state.shadow) return;
    const toolbar = state.shadow.querySelector("[data-toolbar]");
    const list = state.shadow.querySelector("[data-list]");
    const footer = state.shadow.querySelector("[data-footer]");
    const status = state.shadow.querySelector("[data-status]");
    if (!toolbar || !list || !footer || !status) return;

    toolbar.replaceChildren(
      button("Rescan", rescan),
      button("Reset", resetLayout, "danger"),
      button("Copy order", copyOrder, "primary copy"),
    );

    const criticalHidden = state.sections.filter(
      (item) => item.hidden && ["checkout", "package-selector"].includes(item.key),
    );
    status.textContent = `${state.sections.length} section${state.sections.length === 1 ? "" : "s"} detected${
      criticalHidden.length ? ` • ${criticalHidden.map((x) => x.label).join(" + ")} hidden` : ""
    }`;

    list.replaceChildren();
    if (!state.sections.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No reviewable PuraMini storefront sections detected.";
      list.appendChild(empty);
    } else state.sections.forEach((item, index) => list.appendChild(row(item, index)));

    footer.replaceChildren(
      button("Presentation mode", hidePanel),
      button("Reset + close", () => { resetLayout(); hidePanel(); }),
    );
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Visual order only; DOM keyboard/reading order stays original. Refresh discards the session.";
    footer.appendChild(hint);
    requestAnimationFrame(() => restoreFocus(focusKey, focusAction));
  }

  function initialize() {
    if (state.initialized) return true;
    if (!supportedRoute()) return false;
    const found = discover();
    if (!found.compatible) return false;
    state.container = found.container;
    state.baseline = found.sections.map((item) => ({ ...item, hidden: false }));
    state.sections = state.baseline.map((item) => ({ ...item }));
    state.initialized = true;
    ensurePanel();
    renderPanel();
    return true;
  }

  function showPanel() {
    if (!initialize()) return;
    reconcile({ render: false });
    ensurePanel();
    state.host.style.display = "block";
    state.panelVisible = true;
    renderPanel();
  }

  function hidePanel() {
    clearHighlight();
    if (state.host) state.host.style.display = "none";
    state.panelVisible = false;
  }

  function deactivate() {
    restoreAll();
    if (state.reconcileTimer) clearTimeout(state.reconcileTimer);
    state.host?.remove();
    Object.assign(state, {
      initialized: false, panelVisible: false, layoutActive: false, container: null,
      sections: [], baseline: [], host: null, shadow: null, draggedKey: null,
      highlighted: null, reconcileTimer: null,
    });
  }

  function togglePanel() {
    if (!supportedRoute()) {
      if (state.initialized) deactivate();
      return;
    }
    if (!state.initialized || !state.panelVisible) showPanel();
    else hidePanel();
  }

  function mutationTouchesStorefront(records) {
    if (!state.initialized) return false;
    const main = document.querySelector("main");
    if (main !== state.container) return true;
    return records.some((record) => {
      if (record.target === state.container) return true;
      return [...record.addedNodes, ...record.removedNodes].some(
        (node) => node.nodeType === Node.ELEMENT_NODE &&
          (node === state.container || node.matches?.("main") || node.querySelector?.("main")),
      );
    });
  }

  const observer = new MutationObserver((records) => {
    if (!state.initialized) return;
    if (!supportedRoute()) { deactivate(); return; }
    if (mutationTouchesStorefront(records)) scheduleReconcile();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("popstate", () => setTimeout(() => {
    if (!supportedRoute()) deactivate();
    else if (state.initialized) scheduleReconcile();
  }, 0));

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!anchor) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch { return; }
    if (url.origin !== location.origin || url.pathname === location.pathname) return;
    setTimeout(() => {
      if (!supportedRoute()) deactivate();
      else if (state.initialized) scheduleReconcile();
    }, 60);
  }, true);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "LAYOUT_REVIEW_TOGGLE_PANEL") togglePanel();
  });
})();
