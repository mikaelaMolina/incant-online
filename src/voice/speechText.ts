/** Drop bits that sound odd read aloud: bar slot tags, symbols. */
export function stripForSpeech(text: string): string {
  return text
    .replace(/\[\d\]/g, '')
    .replace(/×/g, ' times ')
    .replace(/[“”]/g, '')
    .replace(/…/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}
