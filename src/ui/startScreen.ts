import { Castle, Flame, ShieldCheck, Sparkles, WandSparkles } from 'lucide';
import { icon } from './icons';
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
        ? '<p>No speech recognition in this browser: clips go to our server for text, then are deleted.</p>'
        : '';

    this.el.innerHTML = `
      <div class="start-shell">
        <header class="start-top">
          <div class="start-brand">
            <span class="start-logo">${icon(WandSparkles, 20)}</span>
            <span id="start-title">Incant Online</span>
          </div>
          <span class="badge start-browser">Chrome · Edge</span>
        </header>

        <section class="card start-hero">
          <div class="start-art" aria-hidden="true">${icon(Sparkles, 64)}</div>
          <h1>Say it.<br />Cast it.</h1>
          ${
            voice
              ? `<div class="start-awaken">
                   <button type="button" class="btn mic-button mic-large" aria-label="Hold to speak">${MIC_ICON}</button>
                   <div>
                     <span class="start-hold">Hold <kbd class="kbd">V</kbd> and say</span>
                     <p class="start-phrase">“${AWAKENING_PHRASE}”</p>
                   </div>
                 </div>
                 <p class="start-heard" aria-live="polite"></p>`
              : `<p class="start-heard" aria-live="polite">No voice in this browser. Type instead.</p>`
          }
          <div class="start-actions">
            <button type="button" class="btn start-enter" data-size="lg">Play without voice</button>
            <p class="start-status" aria-live="polite">Loading…</p>
          </div>
        </section>

        <div class="start-steps">
          <div class="start-step forge">${icon(Flame, 22)}<strong>Forge</strong><span>“fire spin”</span></div>
          <div class="start-step recite">${icon(WandSparkles, 22)}<strong>Recite</strong><span>say its name</span></div>
          <div class="start-step build">${icon(Castle, 22)}<strong>Build</strong><span>“frozen castle”</span></div>
        </div>

        <div class="start-row">
          <section class="card start-notes">
            <span class="start-notes-icon">${icon(ShieldCheck, 18)}</span>
            <div>
              <p><strong>Push-to-talk only.</strong> Browser speech recognition may send audio to your browser vendor (e.g. Google). We never store audio. <span class="start-permission"></span></p>
              ${fallbackNote}
            </div>
          </section>
          <section class="card start-keys" aria-label="Controls">
            <span><kbd class="kbd">WASD</kbd>move</span>
            <span><kbd class="kbd">Click</kbd>strike</span>
            <span><kbd class="kbd">Space</kbd>dodge</span>
            <span><kbd class="kbd">V</kbd>talk</span>
            <span><kbd class="kbd">Enter</kbd>type</span>
          </section>
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
    this.status.textContent = 'Ready.';
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
    else this.status.textContent = 'Almost ready…';
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
            ? 'Mic allowed.'
            : status.state === 'denied'
              ? 'Mic blocked: allow it in the address bar, or type.'
              : '';
      };
      render();
      status.onchange = render;
    } catch {
      // Permissions API not available for microphone (e.g. Firefox): nothing to show.
    }
  }
}
