import { describe, expect, it } from 'vitest';
import { pickVoice, stripForSpeech } from './narrator';

const v = (name: string, lang: string, localService = true) => ({ name, lang, localService }) as SpeechSynthesisVoice;

describe('narrator', () => {
  it('prefers neural / enhanced voices over old desktop voices', () => {
    const windowsEdge = [
      v('Microsoft David Desktop - English (United States)', 'en-US'),
      v('Microsoft Zira Desktop - English (United States)', 'en-US'),
      v('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB', false),
      v('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false),
    ];
    expect(pickVoice(windowsEdge)?.name).toBe('Microsoft Ryan Online (Natural) - English (United Kingdom)');
    const windowsChrome = [
      v('Microsoft David - English (United States)', 'en-US'),
      v('Google US English', 'en-US', false),
      v('Google UK English Female', 'en-GB', false),
      v('Google UK English Male', 'en-GB', false),
    ];
    expect(pickVoice(windowsChrome)?.name).toBe('Google UK English Male');
    const mac = [v('Fred', 'en-US'), v('Daniel', 'en-GB'), v('Daniel (Enhanced)', 'en-GB')];
    expect(pickVoice(mac)?.name).toBe('Daniel (Enhanced)');
  });

  it('prefers an en-GB voice among plain ones', () => {
    expect(pickVoice([v('Anna', 'de-DE'), v('Samantha', 'en-US'), v('Daniel', 'en-GB')])?.name).toBe('Daniel');
    expect(pickVoice([v('Anna', 'de-DE')])?.name).toBe('Anna');
    expect(pickVoice([])).toBeUndefined();
  });
  it('drops symbols that read badly aloud', () => {
    expect(stripForSpeech('Forged Frost Comet [3]: 3× ice orb…')).toBe('Forged Frost Comet : 3 times ice orb.');
  });
});
