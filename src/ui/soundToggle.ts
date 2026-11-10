const SPEAKER = '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>';
const ICON_ON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${SPEAKER}<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${SPEAKER}<path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

/** Round top-right icon button (and the M key) to mute sound effects and the Arbiter's voice. */
export class SoundToggle {
  private readonly el = document.createElement('button');

  constructor(parent: HTMLElement, muted: boolean, onToggle: () => boolean) {
    this.el.type = 'button';
    this.el.className = 'sound-toggle';
    this.el.addEventListener('click', () => this.set(onToggle()));
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)) return;
      this.set(onToggle());
    });
    parent.appendChild(this.el);
    this.set(muted);
  }

  set(muted: boolean): void {
    this.el.innerHTML = muted ? ICON_OFF : ICON_ON;
    this.el.setAttribute('aria-label', 'Sound'); // state is carried by aria-pressed
    this.el.title = `Sound ${muted ? 'off' : 'on'} (M)`;
    this.el.setAttribute('aria-pressed', String(!muted));
    this.el.dataset.muted = String(muted);
  }
}
