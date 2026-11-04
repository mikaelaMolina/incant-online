import { normaliseUtterance } from './utterance';

export type UtteranceSource = 'voice' | 'text';

export interface Utterance {
  text: string;
  source: UtteranceSource;
}

export type UtteranceHandler = (u: Utterance) => void;

/**
 * Single entry point for player input: speech and the text box both submit here.
 * The intent router (recite / command / refine / talk / forge) subscribes to it.
 */
export class UtterancePipeline {
  private handler: UtteranceHandler | undefined;

  /** Replace the current handler (start screen → game). */
  setHandler(handler: UtteranceHandler): void {
    this.handler = handler;
  }

  submit(raw: string, source: UtteranceSource): Utterance | null {
    const text = normaliseUtterance(raw);
    if (!text) return null;
    const u = { text, source };
    this.handler?.(u);
    return u;
  }
}
