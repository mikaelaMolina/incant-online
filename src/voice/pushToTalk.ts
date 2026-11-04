import type { SpeechInput } from './speechInput';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** Hold V, or hold any bound on-screen button, to talk. Release to send. */
export class PushToTalk {
  enabled = true;

  constructor(private readonly speech: SpeechInput) {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyV' || e.repeat || isTyping(e.target) || !this.enabled) return;
      e.preventDefault();
      this.speech.press();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyV') this.speech.release();
    });
    window.addEventListener('blur', () => this.speech.release());
  }

  bindButton(button: HTMLElement): void {
    button.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      this.speech.press();
    });
    const up = (): void => this.speech.release();
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
    // Keyboard users: Space/Enter on the focused button toggles like a hold.
    button.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        this.speech.press();
      }
    });
    button.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') this.speech.release();
    });
  }
}
