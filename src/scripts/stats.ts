// Progressive enhancement over the four static stat tiles: without this,
// the four values the page rendered (the start page, the plugin area) just sit there,
// correct and final. With it, a slot swaps to a different metric from the
// pool every few seconds, one at a time so the page stays legible instead
// of flashing all four at once.

interface Metric {
  label: string;
  value: string;
}

const dl = document.querySelector<HTMLElement>('.m-stats[data-stats-pool]');
if (dl) {
  let pool: Metric[] = [];
  try {
    pool = JSON.parse(dl.dataset.statsPool ?? '[]');
  } catch {
    pool = [];
  }

  const slots = [...dl.querySelectorAll<HTMLElement>(':scope > div')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SWAP_MS = 260;
  const MIN_INTERVAL = 4000;
  const MAX_INTERVAL = 8000;

  function currentLabels(): string[] {
    return slots.map((s) => s.querySelector('.m-stat-label')?.textContent ?? '');
  }

  function swapOnce(): void {
    if (pool.length <= slots.length) return; // nothing new to rotate in
    const shown = currentLabels();
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const candidates = pool.filter((m) => !shown.includes(m.label));
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    if (!slot || !next) return;

    const label = slot.querySelector<HTMLElement>('.m-stat-label');
    const value = slot.querySelector<HTMLElement>('.m-stat-value');
    if (!label || !value) return;

    const apply = (): void => {
      label.textContent = next.label;
      value.textContent = next.value;
    };

    if (reduceMotion) {
      apply();
    } else {
      label.classList.add('is-swapping');
      value.classList.add('is-swapping');
      setTimeout(() => {
        apply();
        label.classList.remove('is-swapping');
        value.classList.remove('is-swapping');
      }, SWAP_MS);
    }
  }

  // The rotation runs only while the tab is visible and the visitor has not paused it.
  // Under reduced motion it starts paused: the figures stay static unless asked for.
  let playing = !reduceMotion;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function stop(): void {
    clearTimeout(timer);
    timer = undefined;
  }

  function schedule(): void {
    stop();
    if (!playing || document.hidden) return;
    const delay = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
    timer = setTimeout(() => {
      swapOnce();
      schedule();
    }, delay);
  }

  if (pool.length > slots.length) {
    // The pause control exists only with script, like the rotation itself.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'm-stats-toggle';
    const sync = (): void => {
      button.textContent = playing ? 'Pause rotation' : 'Rotate figures';
    };
    button.addEventListener('click', () => {
      playing = !playing;
      sync();
      schedule();
    });
    sync();
    dl.after(button);

    document.addEventListener('visibilitychange', schedule);
    schedule();
  }
}
