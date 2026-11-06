import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOUNDS, sfx } from './sfx';

const PUBLIC = join(__dirname, '../../public');

describe('sound bank', () => {
  it('every sound file exists, and every pack folder carries its licence', () => {
    const files = new Set(Object.values(SOUNDS).flatMap((s) => s.files));
    for (const f of files) expect(existsSync(join(PUBLIC, f)), f).toBe(true);
    for (const dir of new Set([...files].map((f) => f.split('/').slice(0, -1).join('/')))) {
      const lic = ['LICENSE.txt', 'License.txt'].map((n) => join(PUBLIC, dir, n)).find(existsSync);
      expect(lic, dir).toBeDefined();
      expect(readFileSync(lic!, 'utf8')).toMatch(/CC0|Creative Commons Zero/);
    }
  });

  it('every pack is credited in CREDITS.md', () => {
    const credits = readFileSync(join(__dirname, '../../CREDITS.md'), 'utf8');
    for (const pack of ['100 CC0 SFX', 'RPG Sound Pack', 'Interface Sounds']) expect(credits).toContain(pack);
  });

  it('is silent and harmless without Web Audio (tests, old browsers)', () => {
    expect(() => {
      sfx.unlock();
      sfx.play('hit', { pan: 2, volume: 5 });
    }).not.toThrow();
  });
});
