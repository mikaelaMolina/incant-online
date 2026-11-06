/** Small top-right button (and the M key) to mute sound effects and the Arbiter's voice. */
export class SoundToggle {
  private readonly el = document.createElement('button');

  constructor(parent: HTMLElement, muted: boolean, onToggle: () => boolean) {
    this.el.type = 'button';
    this.el.className = 'sound-toggle';
    this.el.title = 'Sound on/off (M)';
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
    this.el.textContent = muted ? 'Sound off' : 'Sound on';
    this.el.setAttribute('aria-pressed', String(!muted));
    this.el.dataset.muted = String(muted);
  }
}
