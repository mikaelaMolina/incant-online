import { describe, expect, it } from 'vitest';
import { pickVoice, stripForSpeech } from './narrator';

const v = (name: string, lang: string, localService = true) => ({ name, lang, localService }) as SpeechSynthesisVoice;

describe('narrator', () => {
  it('prefers a local en-GB voice', () => {
    expect(pickVoice([v('Anna', 'de-DE'), v('Samantha', 'en-US'), v('Daniel', 'en-GB')])?.name).toBe('Daniel');
    expect(pickVoice([v('Anna', 'de-DE')])?.name).toBe('Anna');
    expect(pickVoice([])).toBeUndefined();
  });
  it('drops symbols that read badly aloud', () => {
    expect(stripForSpeech('Forged Frost Comet [3]: 3× ice orb…')).toBe('Forged Frost Comet : 3 times ice orb.');
  });
});
