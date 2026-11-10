import { Castle, Flame, ShieldCheck, Sparkles, WandSparkles } from 'lucide';
import { icon } from './icons';
import { MIC_ICON } from './micIcon';
import { MAX_UTTERANCE_LENGTH } from '../voice/utterance';
import type { VoiceMode, VoiceState } from '../voice/speechInput';

/** One-click starting worlds: still the player's words, just pre-written. */
const QUICK_WORLDS = ['a frozen castle', 'a misty forest at night', 'desert ruins at dusk'] as const;

/**
 * Title screen. The player enters by speaking (hold V or the mic) or typing the world they want;
 * that description builds floor 1. Carries the microphone explanation and the privacy notice
 * required by CLAUDE.md.
 */
export class StartScreen {
  readonly el = document.createElement('section');
  readonly micButton: HTMLButtonElement;
  private readonly input: HTMLInputElement;
  private readonly buildButton: HTMLButtonElement;
  private readonly heard: HTMLParagraphElement;
  private readonly status: HTMLParagraphElement;
  private readonly permission: HTMLSpanElement;
  private entering = false;
  private busy = false;
  onEnter: (() => void) | undefined;
  /** The player described a world (typed, or a quick pick). Spoken words arrive through the voice pipeline. */
  onWorld: ((text: string) => void) | undefined;

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
          <form class="start-world" autocomplete="off">
            <label class="start-hold" for="start-world-input">${voice ? 'Hold <kbd class="kbd">V</kbd> and describe your world, or type it' : 'Describe your world'}</label>
            <div class="start-world-row">
              ${voice ? `<button type="button" class="btn mic-button mic-large" aria-label="Hold to speak">${MIC_ICON}</button>` : ''}
              <input id="start-world-input" class="input start-world-input" type="text" spellcheck="false"
                maxlength="${MAX_UTTERANCE_LENGTH}" placeholder="a volcano fortress at dusk…" />
              <button type="submit" class="btn start-build" data-size="lg">Build</button>
            </div>
            <div class="start-quick">
              <span>Try</span>
              ${QUICK_WORLDS.map((w) => `<button type="button" class="badge start-quick-pick">${w}</button>`).join('')}
            </div>
          </form>
          <p class="start-heard" aria-live="polite">${voice ? '' : 'No voice in this browser. Type instead.'}</p>
          <p class="start-status" aria-live="polite">Loading…</p>
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
              <p><strong>Push-to-talk only.</strong> Browser speech recognition may send audio to your browser vendor (e.g. Google). We never store audio. The Arbiter's voice is AI-generated, not a human. <span class="start-permission"></span></p>
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
    this.input = this.el.querySelector('.start-world-input') as HTMLInputElement;
    this.buildButton = this.el.querySelector('.start-build') as HTMLButtonElement;
    this.heard = this.el.querySelector('.start-heard') as HTMLParagraphElement;
    this.status = this.el.querySelector('.start-status') as HTMLParagraphElement;
    this.permission = this.el.querySelector('.start-permission') as HTMLSpanElement;

    const form = this.el.querySelector('.start-world') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit(this.input.value);
    });
    this.input.addEventListener('keydown', (e) => e.stopPropagation()); // typing never moves the Incanter
    for (const pick of this.el.querySelectorAll<HTMLButtonElement>('.start-quick-pick')) {
      pick.addEventListener('click', () => {
        this.input.value = pick.textContent ?? '';
        this.submit(this.input.value);
      });
    }
    void this.showPermissionState();
    this.input.focus();
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  setReady(): void {
    if (!this.busy) this.status.textContent = 'Ready. Describe your world to enter.';
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  /** While a world is being built: inputs off so one description at a time goes through. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    for (const el of [this.input, this.buildButton, ...this.el.querySelectorAll<HTMLButtonElement>('.start-quick-pick')]) el.disabled = busy;
    if (!busy) this.input.focus();
  }

  setVoiceState(state: VoiceState): void {
    this.micButton.dataset.state = state;
    if (state === 'listening') this.heard.textContent = 'Listening…';
  }

  /** Interim or final words, or an in-character reply. */
  showHeard(text: string): void {
    this.heard.textContent = text;
  }

  /** Leave the title screen. `instant` when the reshape curtain already covers it. */
  enter(instant = false): void {
    if (this.entering) return;
    this.entering = true;
    if (this.el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    if (instant) {
      this.el.hidden = true;
    } else {
      this.el.classList.add('leaving');
      window.setTimeout(() => {
        this.el.hidden = true;
      }, 450);
    }
    this.onEnter?.();
  }

  private submit(raw: string): void {
    const text = raw.trim();
    if (!text || this.busy) return;
    this.onWorld?.(text);
  }

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
