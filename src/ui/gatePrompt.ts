/** Hint shown while the Incanter stands in the gate. */
export class GatePrompt {
  private readonly el = document.createElement('div');

  constructor(parent: HTMLElement, voice: boolean) {
    this.el.className = 'gate-prompt';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.el.textContent = voice
      ? 'The gate listens. Hold V and describe the next floor, or press Enter to type it.'
      : 'The gate listens. Press Enter and describe the next floor.';
    parent.appendChild(this.el);
  }

  show(on: boolean): void {
    this.el.hidden = !on;
  }
}
