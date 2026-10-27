export function installSelectionAnimation() {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let animation: Animation | undefined;
  document.addEventListener("keydown", (event) => {
    animation?.cancel();
    if (event.key.toLowerCase() !== "a" || !(event.ctrlKey || event.metaKey) ||
      event.altKey || event.isComposing || event.repeat || motion.matches) return;
    const target = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      ? event.target : document.documentElement;
    // Animate only the native highlight; selection, copy and replacement stay immediate.
    animation = target.animate([
      { "--selection-strength": "0%" },
      { "--selection-strength": "32%" },
    ], { duration: 220, easing: "ease-out" });
  });
  motion.addEventListener("change", () => animation?.cancel());
}
