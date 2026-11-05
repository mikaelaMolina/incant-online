import { describe, expect, it } from 'vitest';
import { classify, matchSystemCommand, ReciteIndex, INTERIM_RECITE_THRESHOLD } from './intentRouter';

const NAMES = ['Blazing Cyclone', 'Thunder Chain', 'Frost Comet', 'Ice'];
const ctx = (over: Partial<Parameters<typeof classify>[1]> = {}) => ({
  recite: new ReciteIndex(NAMES),
  canRefine: true,
  nearGuide: false,
  ...over,
});

describe('recite (Fuse.js, threshold 0.4)', () => {
  const idx = new ReciteIndex(NAMES);
  it.each([
    ['Blazing Cyclone', 'Blazing Cyclone'],
    ['blazing cyclone!', 'Blazing Cyclone'],
    ['cast Frost Comet', 'Frost Comet'],
    ['I invoke thunder chain', 'Thunder Chain'],
    ['blazing cycle on', 'Blazing Cyclone'], // speech slip
    ['frost comets', 'Frost Comet'],
    ['thunder chains', 'Thunder Chain'],
  ])('"%s" → %s', (said, name) => {
    expect(idx.match(said)?.name).toBe(name);
  });

  it.each([
    'make a blazing cyclone of ice', // a forge request, not a recital
    'make it wider', // refine
    'add a stun',
    'build a frozen castle',
    'create a frost comet that bounces',
    'hello there',
    'what is this place',
    'blaze', // too little of the name
  ])('"%s" does not recite', (said) => {
    expect(idx.match(said)).toBeUndefined();
  });

  it('is fast enough to run on every interim transcript', () => {
    const big = new ReciteIndex(Array.from({ length: 60 }, (_, i) => `Incantation Number ${i}`).concat(NAMES));
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) big.match('blazing cyclone');
    expect((performance.now() - t0) / 200).toBeLessThan(5); // ms per match, far under the 500 ms budget
  });

  it('interim threshold is stricter', () => {
    expect(idx.match('blazing cyclone', INTERIM_RECITE_THRESHOLD)?.name).toBe('Blazing Cyclone');
    expect(idx.match('blazing cycle on', INTERIM_RECITE_THRESHOLD)).toBeUndefined();
  });

  it('follows Grimoire changes', () => {
    const i = new ReciteIndex([]);
    expect(i.match('frost comet')).toBeUndefined();
    i.setNames(['Frost Comet']);
    expect(i.match('frost comet')?.name).toBe('Frost Comet');
  });
});

describe('system commands', () => {
  it.each([
    ['Open Grimoire', 'open-grimoire'],
    ['open the grimoire please', 'open-grimoire'],
    ['open the grimwire', 'open-grimoire'],
    ['close the grimoire', 'close-grimoire'],
    ['next floor', 'next-floor'],
    ['Next floor!', 'next-floor'],
    ['take me to the next floor', 'next-floor'],
  ])('"%s" → %s', (said, cmd) => {
    expect(matchSystemCommand(said)).toBe(cmd);
  });
  it('ignores sentences that merely mention them', () => {
    expect(matchSystemCommand('make a spell that opens a grimoire of fire')).toBeUndefined();
    expect(matchSystemCommand('build a castle on the next floor with archers')).toBeUndefined();
  });
});

describe('classify (CLAUDE.md order)', () => {
  it('recite → command → refine → talk → interpret', () => {
    expect(classify('Frost Comet', ctx()).kind).toBe('recite');
    expect(classify('open grimoire', ctx()).kind).toBe('command');
    expect(classify('make it wider', ctx()).kind).toBe('refine');
    expect(classify('add a stun', ctx()).kind).toBe('refine');
    expect(classify('remove the burn', ctx()).kind).toBe('refine');
    expect(classify('who are you?', ctx({ nearGuide: true })).kind).toBe('talk');
    expect(classify('a spinning fire slash', ctx()).kind).toBe('interpret');
  });
  it('refine with nothing to refine goes to interpret', () => {
    expect(classify('make it wider', ctx({ canRefine: false })).kind).toBe('interpret');
  });
});
