import { Volume2, VolumeX } from 'lucide';
import { icon } from './icons';

const ICON_ON = icon(Volume2, 16);
const ICON_OFF = icon(VolumeX, 16);

/** Round top-right icon button (and the M key) to mute sound effects and the Arbiter's voice. */
export class SoundToggle {
  private readonly el = document.createElement('button');

  constructor(parent: HTMLElement, muted: boolean, onToggle: () => boolean) {
    this.el.type = 'button';
    this.el.className = 'btn sound-toggle';
    this.el.dataset.variant = 'outline';
    this.el.dataset.size = 'icon';
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
