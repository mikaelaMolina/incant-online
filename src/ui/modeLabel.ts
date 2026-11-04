import type { BackendMode } from '../voice/interpretClient';

const TEXT: Record<BackendMode, string> = {
  mock: 'Mock mode',
  llm: '',
  offline: 'Offline: cached Incantations',
};
const TITLE: Record<BackendMode, string> = {
  mock: 'No LLM is called: a local keyword parser interprets your words. Set ANTHROPIC_API_KEY (and unset LLM_MODE=mock) to use Claude.',
  llm: '',
  offline: 'The backend (/api/interpret) cannot be reached, so the Spire answers from cached Incantations.',
};

/** Small corner label so nobody forgets the game is not talking to the LLM. Hidden in llm mode. */
export class ModeLabel {
  private readonly el = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.el.className = 'mode-label';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  set(mode: BackendMode): void {
    this.el.hidden = mode === 'llm';
    this.el.textContent = TEXT[mode];
    this.el.title = TITLE[mode];
    this.el.dataset.mode = mode;
  }
}
