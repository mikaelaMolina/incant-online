import { MIC_ICON } from './micIcon';
import { AWAKENING_PHRASE } from '../voice/utterance';
import type { VoiceMode, VoiceState } from '../voice/speechInput';

/**
 * Title screen. Say the awakening phrase (hold V or the mic button) or press Enter to begin.
 * Carries the microphone explanation and the privacy notice required by CLAUDE.md.
 */
export class StartScreen {
  readonly el = document.createElement('section');
  readonly micButton: HTMLButtonElement;
  private readonly enterButton: HTMLButtonElement;
  private readonly heard: HTMLParagraphElement;
  private readonly status: HTMLParagraphElement;
  private readonly permission: HTMLSpanElement;
  private ready = false;
  private entering = false;
  onEnter: (() => void) | undefined;

  constructor(parent: HTMLElement, voiceMode: VoiceMode) {
    this.el.className = 'start-screen';
    this.el.setAttribute('aria-labelledby', 'start-title');
    const voice = voiceMode !== 'none';
    const fallbackNote =
      voiceMode === 'recorder'
        ? '<p class="start-small">This browser has no built-in speech recognition, so your recording is sent to our server to be turned into text, then discarded.</p>'
        : '';

    this.el.innerHTML = `
      <div class="start-card">
        <h1 id="start-title">Incant Online</h1>
        <p class="start-tagline">Say it. Cast it.</p>

        ${
          voice
            ? `<div class="start-awaken">
                 <button type="button" class="mic-button mic-large" aria-label="Hold to speak">${MIC_ICON}</button>
                 <div>
                   <p>Hold <kbd>V</kbd>, or hold the button, and say the awakening phrase:</p>
                   <p class="start-phrase">“${AWAKENING_PHRASE}”</p>
                 </div>
               </div>
               <p class="start-heard" aria-live="polite"></p>`
            : `<p class="start-heard" aria-live="polite">This browser cannot carry your voice. You can still play by typing.</p>`
        }

        <button type="button" class="start-enter">Enter without voice</button>
        <p class="start-status" aria-live="polite">The Spire is assembling…</p>

        <div class="start-notes">
          <p><strong>Microphone.</strong> Incant Online only listens while you hold <kbd>V</kbd> or the mic button (push-to-talk). The first time, your browser asks for permission: allow it, then hold again. <span class="start-permission"></span></p>
          <p><strong>Privacy.</strong> Browser speech recognition may send your audio to your browser vendor (for example Google or Microsoft) to turn it into text. Our backend never stores audio.</p>
          ${fallbackNote}
          <p><strong>Best in Chrome or Edge.</strong> Other browsers can play by typing.</p>
          <p class="start-small">Controls: WASD move · mouse aim · left click strike · Space dodge · V talk · Enter type</p>
        </div>
      </div>`;
    parent.appendChild(this.el);

    this.micButton = (this.el.querySelector('.mic-large') as HTMLButtonElement | null) ?? document.createElement('button');
    this.enterButton = this.el.querySelector('.start-enter') as HTMLButtonElement;
    this.heard = this.el.querySelector('.start-heard') as HTMLParagraphElement;
    this.status = this.el.querySelector('.start-status') as HTMLParagraphElement;
    this.permission = this.el.querySelector('.start-permission') as HTMLSpanElement;

    this.enterButton.addEventListener('click', () => this.enter());
    window.addEventListener('keydown', this.onKey);
    void this.showPermissionState();
    this.enterButton.focus();
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  setReady(): void {
    this.ready = true;
    this.status.textContent = 'The Spire awaits.';
    if (this.entering) this.finish();
  }

  setVoiceState(state: VoiceState): void {
    this.micButton.dataset.state = state;
    if (state === 'listening') this.heard.textContent = 'Listening…';
  }

  /** Interim or final words, or an in-character reply. */
  showHeard(text: string): void {
    this.heard.textContent = text;
  }

  /** Begin (awakening phrase said, Enter pressed or button clicked). */
  enter(): void {
    if (this.entering) return;
    this.entering = true;
    if (this.ready) this.finish();
    else this.status.textContent = 'The Spire is still assembling… you will enter in a moment.';
  }

  private finish(): void {
    window.removeEventListener('keydown', this.onKey);
    if (this.el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.el.classList.add('leaving');
    window.setTimeout(() => {
      this.el.hidden = true;
    }, 450);
    this.onEnter?.();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.repeat && document.activeElement !== this.micButton) {
      e.preventDefault();
      this.enter();
    }
  };

  private async showPermissionState(): Promise<void> {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const render = (): void => {
        this.permission.textContent =
          status.state === 'granted'
            ? 'Microphone: allowed.'
            : status.state === 'denied'
              ? 'Microphone: blocked. Allow it from the address bar to speak, or type instead.'
              : '';
      };
      render();
      status.onchange = render;
    } catch {
      // Permissions API not available for microphone (e.g. Firefox): nothing to show.
    }
  }
}
