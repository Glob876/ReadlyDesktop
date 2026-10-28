// Keep the splash outside #app so the first render can prepare the real window.
export function showSplash(root: HTMLElement) {
  const splash = document.createElement("div");
  splash.className = "startup-splash";
  splash.setAttribute("aria-hidden", "true");
  splash.innerHTML = '<div class="startup-backdrop"></div><div class="startup-logo"><div class="startup-shimmer"></div></div>';
  document.body.append(splash);
  root.setAttribute("data-starting", "");
  root.inert = true;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const animations: Animation[] = [];
  const dismiss = () => {
    animations.forEach(animation => animation.cancel());
    splash.remove();
    root.removeAttribute("data-starting");
    root.inert = false;
  };
  const reveal = async () => {
    const target = root.querySelector<HTMLElement>(".brand-mark");
    if (!target || reducedMotion.matches) { dismiss(); return; }
    const logo = splash.querySelector<HTMLElement>(".startup-logo")!;
    const shimmer = splash.querySelector<HTMLElement>(".startup-shimmer")!;
    const backdrop = splash.querySelector<HTMLElement>(".startup-backdrop")!;
    const from = logo.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const x = to.x + to.width / 2 - (from.x + from.width / 2);
    const y = to.y + to.height / 2 - (from.y + from.height / 2);
    const duration = 5000;
    animations.push(
      logo.animate([
        { transform: "translate(0, 0) scale(1)", offset: 0, easing: "cubic-bezier(.25, 0, .3, 1)" },
        { transform: "translate(0, 0) scale(1.16)", offset: .56, easing: "cubic-bezier(.65, 0, .2, 1)" },
        { transform: `translate(${x}px, ${y}px) scale(${to.width / from.width})`, offset: 1 },
      ], { duration, fill: "both" }),
      shimmer.animate([
        { backgroundPosition: "0% 50%", opacity: 1, offset: 0 },
        { backgroundPosition: "65% 50%", opacity: 1, offset: .55 },
        { backgroundPosition: "100% 50%", opacity: 0, offset: .9 },
        { backgroundPosition: "100% 50%", opacity: 0, offset: 1 },
      ], { duration, easing: "ease-in-out", fill: "both" }),
      backdrop.animate([
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: .7 },
        { opacity: 0, offset: 1 },
      ], { duration, easing: "ease-in-out", fill: "both" }),
    );
    // Resizing changes the docking destination; reveal the already loaded app.
    const stop = () => dismiss();
    window.addEventListener("resize", stop, { once: true });
    reducedMotion.addEventListener("change", stop, { once: true });
    try { await animations[0].finished; } catch { /* Cancelled by a resize. */ }
    finally {
      window.removeEventListener("resize", stop);
      reducedMotion.removeEventListener("change", stop);
      dismiss();
    }
  };
  return { reveal, dismiss };
}
