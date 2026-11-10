import { MIC_ICON } from './micIcon';
import { AWAKENING_PHRASE } from '../voice/utterance';
import type { VoiceMode, VoiceState } from '../voice/speechInput';

const SPARK = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" fill="currentColor"/></svg>`;

/** Original decorative sigil for the hero card: petals of light around a dark core with a staff orb. */
const SIGIL = `<svg viewBox="0 0 240 240" focusable="false">
  <defs>
    <linearGradient id="sg-petal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fcf0cc"/><stop offset="0.55" stop-color="#f6906c"/><stop offset="1" stop-color="#8d7bff"/>
    </linearGradient>
    <radialGradient id="sg-core" cx="50%" cy="45%" r="55%">
      <stop offset="0" stop-color="#5a1d2b"/><stop offset="1" stop-color="#2a0c15"/>
    </radialGradient>
    <radialGradient id="sg-orb" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#ffd2b8"/><stop offset="1" stop-color="#ec5a43" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g transform="translate(120 120)" opacity="0.9">
    <rect x="-78" y="-78" width="156" height="156" rx="58" fill="url(#sg-petal)" opacity="0.55" transform="rotate(12)"/>
    <rect x="-78" y="-78" width="156" height="156" rx="58" fill="url(#sg-petal)" opacity="0.55" transform="rotate(42)"/>
    <rect x="-78" y="-78" width="156" height="156" rx="58" fill="url(#sg-petal)" opacity="0.55" transform="rotate(72)"/>
  </g>
  <circle cx="120" cy="120" r="70" fill="url(#sg-core)"/>
  <circle cx="120" cy="120" r="58" fill="none" stroke="#fcf0cc" stroke-opacity="0.18" stroke-width="1.5"/>
  <path d="M84 108 Q120 76 156 108" fill="none" stroke="#fcd9c4" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  <path d="M92 118 Q120 94 148 118" fill="none" stroke="#fcd9c4" stroke-width="1.6" stroke-linecap="round" opacity="0.35"/>
  <line x1="106" y1="164" x2="128" y2="104" stroke="#c98b4a" stroke-width="5" stroke-linecap="round"/>
  <circle cx="130" cy="98" r="18" fill="url(#sg-orb)"/>
</svg>`;

/** "Good morning / afternoon / evening" by the player's local clock. */
function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

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
          <p class="start-greeting">${greeting()}, <strong>Incanter</strong></p>
          <span class="chip chip-dark">Best in Chrome or Edge</span>
        </header>

        <div class="start-grid">
          <section class="start-hero">
            <div class="start-hero-text">
              <span class="chip chip-cream">${SPARK} Voice-first action RPG</span>
              <h1 id="start-title">Incant Online</h1>
              <p class="start-tagline">Say it. Cast it.</p>
              <p class="start-blurb">Speak spells and places into being, then cast them by name as you climb the Spire, floor by floor.</p>
              ${
                voice
                  ? `<div class="start-awaken">
                       <button type="button" class="mic-button mic-large" aria-label="Hold to speak">${MIC_ICON}</button>
                       <div>
                         <p>Hold <kbd>V</kbd> or the button and say:</p>
                         <p class="start-phrase">“${AWAKENING_PHRASE}”</p>
                       </div>
                     </div>
                     <p class="start-heard" aria-live="polite"></p>`
                  : `<p class="start-heard" aria-live="polite">This browser cannot carry your voice. You can still play by typing.</p>`
              }
              <div class="start-actions">
                <button type="button" class="start-enter">Enter without voice</button>
                <p class="start-status" aria-live="polite">The Spire is assembling…</p>
              </div>
            </div>
            <div class="start-sigil" aria-hidden="true">${SIGIL}</div>
          </section>

          <section class="start-side" aria-labelledby="start-how">
            <h2 class="start-h2" id="start-how">How to play</h2>
            <div class="start-step">
              <span class="start-step-icon forge">1</span>
              <span class="start-step-text"><strong>Forge</strong>Describe a spell: <em>“fire spin, three hits”</em></span>
            </div>
            <div class="start-step">
              <span class="start-step-icon recite">2</span>
              <span class="start-step-text"><strong>Recite</strong>Say its name to cast it, or press its number</span>
            </div>
            <div class="start-step">
              <span class="start-step-icon build">3</span>
              <span class="start-step-text"><strong>Build</strong>Describe a place: <em>“a frozen castle”</em></span>
            </div>
          </section>

          <div class="start-cards">
            <section class="start-notes">
              <h2>Microphone and privacy</h2>
              <p><strong>Push-to-talk.</strong> Incant Online only listens while you hold <kbd>V</kbd> or the mic button. The first time, your browser asks for permission: allow it, then hold again. <span class="start-permission"></span></p>
              <p><strong>Privacy.</strong> Browser speech recognition may send your audio to your browser vendor (for example Google or Microsoft) to turn it into text. Our backend never stores audio.</p>
              ${fallbackNote}
            </section>
            <section class="start-notes">
              <h2>Controls</h2>
              <dl class="start-controls">
                <dt><kbd>WASD</kbd></dt><dd>Move</dd>
                <dt><kbd>Mouse</kbd></dt><dd>Aim · left click to strike</dd>
                <dt><kbd>Space</kbd></dt><dd>Dodge</dd>
                <dt><kbd>V</kbd></dt><dd>Hold to speak</dd>
                <dt><kbd>Enter</kbd></dt><dd>Type instead</dd>
              </dl>
            </section>
          </div>
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
