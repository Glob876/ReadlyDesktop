import "./ranges.css";

// Native range inputs retain pointer, touch and keyboard behavior.
export function installRangeStyles(root: HTMLElement) {
  const update = (input: HTMLInputElement) => {
    const min = input.min === "" ? 0 : Number(input.min);
    const max = input.max === "" ? 100 : Number(input.max);
    const progress = max > min ? Math.max(0, Math.min(100, (input.valueAsNumber - min) / (max - min) * 100)) : 0;
    input.style.setProperty("--range-progress", `${progress}%`);
  };
  const refresh = () => root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(update);
  root.addEventListener("input", event => {
    if (event.target instanceof HTMLInputElement && event.target.type === "range") update(event.target);
  }, { capture: true });
  // Settings are rendered again on save, cancel and tab changes.
  new MutationObserver(refresh).observe(root, { childList: true, subtree: true });
  refresh();
}
