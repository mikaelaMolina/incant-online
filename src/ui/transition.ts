/**
 * "The Spire reshapes…" curtain shown while a floor is being generated and built.
 * Fades in over the game, shows the floor's name once known, fades out when the floor is ready.
 */
export class ReshapeTransition {
  private readonly el = document.createElement('div');
  private readonly title = document.createElement('div');
  private readonly sub = document.createElement('div');
  private shownAt = 0;
  private hideTimer: number | undefined;

  constructor(parent: HTMLElement) {
    this.el.className = 'reshape';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.title.className = 'reshape-title';
    this.title.textContent = 'The Spire reshapes…';
    this.sub.className = 'reshape-sub';
    const rune = document.createElement('div');
    rune.className = 'reshape-rune';
    this.el.append(rune, this.title, this.sub);
    parent.appendChild(this.el);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(subtitle = ''): void {
    window.clearTimeout(this.hideTimer);
    if (this.el.hidden) {
      this.shownAt = performance.now();
      this.el.hidden = false;
      this.el.classList.remove('reshape-out');
      void this.el.offsetWidth; // restart the fade-in
      this.el.classList.add('reshape-in');
    }
    this.sub.textContent = subtitle;
  }

  /** Fade out, but stay at least `minMs` in total so it never just flickers. */
  hide(minMs = 900): Promise<void> {
    if (this.el.hidden) return Promise.resolve();
    const wait = Math.max(0, minMs - (performance.now() - this.shownAt));
    return new Promise((resolve) => {
      this.hideTimer = window.setTimeout(() => {
        this.el.classList.remove('reshape-in');
        this.el.classList.add('reshape-out');
        this.hideTimer = window.setTimeout(() => {
          this.el.hidden = true;
          this.el.classList.remove('reshape-out');
          resolve();
        }, 450);
      }, wait);
    });
  }
}
