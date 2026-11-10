import { Castle, Flame, Sparkles, WandSparkles } from 'lucide';
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
        ? '<p class="start-small">This browser has no built-in speech recognition, so your recording is sent to our server to be turned into text, then discarded.</p>'
        : '';

    this.el.innerHTML = `
      <div class="start-shell">
        <header class="start-top">
          <div class="start-brand">
            <span class="start-logo">${icon(WandSparkles, 18)}</span>
            <span id="start-title">Incant Online</span>
          </div>
        </header>

        <div class="start-grid">
          <section class="card start-hero">
            <header>
              <span class="badge" data-variant="secondary">${icon(Sparkles, 12)} Voice-first action RPG</span>
              <h1>Say it. Cast it.</h1>
              <p>Speak spells and places into being, then cast them by name as you climb the Spire, floor by floor.</p>
            </header>
            <section>
              ${
                voice
                  ? `<div class="item start-awaken" data-variant="muted">
                       <figure><button type="button" class="btn mic-button mic-large" data-size="icon-lg" aria-label="Hold to speak">${MIC_ICON}</button></figure>
                       <section>
                         <h3>Hold <kbd class="kbd">V</kbd> or the mic and say</h3>
                         <p class="start-phrase">“${AWAKENING_PHRASE}”</p>
                       </section>
                     </div>
                     <p class="start-heard" aria-live="polite"></p>`
                  : `<p class="start-heard" aria-live="polite">This browser cannot carry your voice. You can still play by typing.</p>`
              }
            </section>
            <footer class="start-actions">
              <button type="button" class="btn start-enter" data-size="lg">Enter without voice</button>
              <p class="start-status" aria-live="polite">The Spire is assembling…</p>
            </footer>
          </section>

          <section class="card start-side" aria-labelledby="start-how">
            <header>
              <h2 id="start-how">How to play</h2>
              <p>Three things you can say.</p>
            </header>
            <section class="item-group">
              <div class="item" data-variant="outline" data-size="sm">
                <figure class="start-step-icon">${icon(Flame, 16)}</figure>
                <section><h3>Forge</h3><p>Describe a spell: “fire spin, three hits”</p></section>
              </div>
              <div class="item" data-variant="outline" data-size="sm">
                <figure class="start-step-icon">${icon(WandSparkles, 16)}</figure>
                <section><h3>Recite</h3><p>Say its name to cast it, or press its number</p></section>
              </div>
              <div class="item" data-variant="outline" data-size="sm">
                <figure class="start-step-icon">${icon(Castle, 16)}</figure>
                <section><h3>Build</h3><p>Describe a place: “a frozen castle”</p></section>
              </div>
            </section>
          </section>

          <section class="card start-notes">
            <header><h2>Microphone and privacy</h2></header>
            <section>
              <p><strong>Push-to-talk.</strong> Incant Online only listens while you hold <kbd class="kbd">V</kbd> or the mic button. The first time, your browser asks for permission: allow it, then hold again. <span class="start-permission"></span></p>
              <p><strong>Privacy.</strong> Browser speech recognition may send your audio to your browser vendor (for example Google or Microsoft) to turn it into text. Our backend never stores audio.</p>
              ${fallbackNote}
              <p><strong>Best in Chrome or Edge.</strong> Other browsers can play by typing.</p>
            </section>
          </section>

          <section class="card start-notes">
            <header><h2>Controls</h2></header>
            <section>
              <dl class="start-controls">
                <dt><kbd class="kbd">W</kbd><kbd class="kbd">A</kbd><kbd class="kbd">S</kbd><kbd class="kbd">D</kbd></dt><dd>Move</dd>
                <dt><kbd class="kbd">Mouse</kbd></dt><dd>Aim · left click to strike</dd>
                <dt><kbd class="kbd">Space</kbd></dt><dd>Dodge</dd>
                <dt><kbd class="kbd">V</kbd></dt><dd>Hold to speak</dd>
                <dt><kbd class="kbd">Enter</kbd></dt><dd>Type instead</dd>
              </dl>
            </section>
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
