// Native inputs keep editing, selection, IME and accessibility; only the caret is drawn here.
export function installSmoothCaret(root: HTMLElement) {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const overlay = document.createElement("div");
  overlay.className = "caret-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.hidden = true;
  const caret = document.createElement("span");
  caret.className = "smooth-caret";
  overlay.append(caret);
  const mirror = document.createElement("div");
  mirror.className = "caret-mirror";
  mirror.setAttribute("aria-hidden", "true");
  document.body.append(overlay, mirror);
  let active: HTMLInputElement | HTMLTextAreaElement | null = null;
  let composing = false;
  let frame = 0;
  let blinkTimer = 0;
  let first = true;
  const resize = new ResizeObserver(() => schedule());
  const properties = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "lineHeight",
    "letterSpacing", "wordSpacing", "textTransform", "textIndent", "textAlign",
    "direction", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderStyle", "boxSizing", "wordBreak", "overflowWrap",
  ] as const;
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function update() {
    frame = 0;
    const focused = document.activeElement;
    const field = focused instanceof HTMLTextAreaElement ||
      (focused instanceof HTMLInputElement && ["text", "search", "url", "tel"].includes(focused.type))
      ? focused : null;
    if (active !== field) {
      active?.classList.remove("has-smooth-caret");
      resize.disconnect();
      active = field;
      first = true;
      if (active) resize.observe(active);
    }
    const visible = active && !motion.matches && !composing && !active.disabled &&
      active.selectionStart !== null && active.selectionStart === active.selectionEnd;
    if (!visible || !active) {
      active?.classList.remove("has-smooth-caret");
      overlay.hidden = true;
      first = true;
      return;
    }
    const style = getComputedStyle(active);
    for (const property of properties) mirror.style[property] = style[property];
    mirror.style.width = `${active.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`;
    mirror.style.whiteSpace = active instanceof HTMLTextAreaElement ? "pre-wrap" : "pre";
    const value = active.value;
    const position = active.selectionStart!;
    const marker = document.createElement("span");
    marker.textContent = value.slice(position) || "\u200b";
    mirror.replaceChildren(document.createTextNode(value.slice(0, position)), marker);
    const bounds = active.getBoundingClientRect();
    const mirrorBounds = mirror.getBoundingClientRect();
    const markerBounds = marker.getClientRects()[0];
    if (!markerBounds) return;
    const x = markerBounds.left - mirrorBounds.left - active.clientLeft - active.scrollLeft;
    const y = markerBounds.top - mirrorBounds.top - active.clientTop - active.scrollTop;
    Object.assign(overlay.style, {
      left: `${bounds.left + active.clientLeft}px`, top: `${bounds.top + active.clientTop}px`,
      width: `${active.clientWidth}px`, height: `${active.clientHeight}px`,
      color: style.color,
    });
    // Clip to scroll containers too, so the overlay cannot cross the titlebar or a panel edge.
    let top = 0, right = 0, bottom = 0, left = 0;
    for (let parent = active.parentElement; parent; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      const clip = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(parentStyle.overflowY)) {
        top = Math.max(top, clip.top + parent.clientTop - bounds.top - active.clientTop);
        bottom = Math.max(bottom, bounds.top + active.clientTop + active.clientHeight - clip.top - parent.clientTop - parent.clientHeight);
      }
      if (/(auto|scroll|hidden|clip)/.test(parentStyle.overflowX)) {
        left = Math.max(left, clip.left + parent.clientLeft - bounds.left - active.clientLeft);
        right = Math.max(right, bounds.left + active.clientLeft + active.clientWidth - clip.left - parent.clientLeft - parent.clientWidth);
      }
    }
    overlay.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
    caret.style.height = `${markerBounds.height}px`;
    // Focusing a different field starts at its insertion point without flying across the window.
    caret.style.transition = first ? "none" : "";
    caret.style.transform = `translate(${x}px, ${y}px)`;
    overlay.hidden = false;
    active.classList.add("has-smooth-caret");
    if (first) { getComputedStyle(caret).transform; first = false; }
  }
  for (const event of ["focusin", "focusout", "keyup", "pointerup", "select", "selectionchange", "scroll"]) {
    document.addEventListener(event, schedule, true);
  }
  document.addEventListener("input", () => {
    caret.classList.add("is-typing");
    clearTimeout(blinkTimer);
    blinkTimer = window.setTimeout(() => caret.classList.remove("is-typing"), 500);
    schedule();
  });
  document.addEventListener("compositionstart", () => { composing = true; schedule(); });
  document.addEventListener("compositionend", () => { composing = false; schedule(); });
  window.addEventListener("resize", schedule);
  motion.addEventListener("change", schedule);
  new MutationObserver(schedule).observe(root, { childList: true });
}
