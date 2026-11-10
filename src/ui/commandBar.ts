import { MIC_ICON } from './micIcon';
import { MAX_UTTERANCE_LENGTH } from '../voice/utterance';
import type { VoiceState } from '../voice/speechInput';

/** Bottom bar: hold-to-talk mic button + text box. Enter focuses the box; Enter again sends. */
export class CommandBar {
  readonly el = document.createElement('div');
  readonly micButton = document.createElement('button');
  private readonly input = document.createElement('input');
  onSubmit: ((text: string) => void) | undefined;

  constructor(parent: HTMLElement, voiceSupported: boolean) {
    this.el.className = 'command-bar';
    this.el.hidden = true;

    this.micButton.type = 'button';
    this.micButton.className = 'btn mic-button';
    this.micButton.dataset.variant = 'secondary';
    this.micButton.dataset.size = 'icon';
    this.micButton.innerHTML = MIC_ICON;
    this.micButton.setAttribute('aria-label', 'Hold to speak (or hold V)');
    this.micButton.title = voiceSupported ? 'Hold to speak (or hold V)' : 'Voice is not available in this browser';
    this.micButton.disabled = !voiceSupported;

    this.input.type = 'text';
    this.input.className = 'input command-input';
    this.input.maxLength = MAX_UTTERANCE_LENGTH;
    this.input.placeholder = voiceSupported ? 'Hold V or type…' : 'Type…';
    this.input.setAttribute('aria-label', 'Speak to the Spire');
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;

    this.el.append(this.micButton, this.input);
    parent.appendChild(this.el);

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing never moves the Incanter
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.input.value;
        this.input.value = '';
        this.input.blur();
        if (text.trim()) this.onSubmit?.(text);
      } else if (e.key === 'Escape') {
        this.input.blur();
      }
    });

    // Enter anywhere in the game focuses the text box.
    window.addEventListener('keydown', (e) => {
      if (this.el.hidden || e.key !== 'Enter' || e.repeat) return;
      if (document.activeElement === this.input) return;
      if (document.activeElement instanceof HTMLButtonElement) return; // let buttons handle Enter
      e.preventDefault();
      this.input.focus();
    });
  }

  show(): void {
    this.el.hidden = false;
  }

  setVoiceState(state: VoiceState): void {
    this.micButton.dataset.state = state;
    this.micButton.setAttribute('aria-pressed', String(state === 'listening' || state === 'starting'));
  }

  focusInput(): void {
    this.input.focus();
  }
}
