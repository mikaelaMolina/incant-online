import { describe, expect, it } from 'vitest';
import { INN_PRICE, Inventory, MAX_POTIONS, SHOP_ITEMS, STARTING_GOLD, shopLine } from './economy';

describe('economy', () => {
  it('starts with enough gold for one potion in the village', () => {
    const inv = new Inventory();
    expect(inv.gold).toBe(STARTING_GOLD);
    expect(inv.check('health_potion').ok).toBe(true);
  });

  it('buying a potion costs gold and adds it to the bag; drinking uses it', () => {
    const inv = new Inventory();
    const price = SHOP_ITEMS.find((i) => i.id === 'health_potion')!.price;
    expect(inv.buy('health_potion').ok).toBe(true);
    expect(inv.gold).toBe(STARTING_GOLD - price);
    expect(inv.potions.health).toBe(1);
    expect(inv.usePotion('health')).toBe(true);
    expect(inv.usePotion('health')).toBe(false);
  });

  it('refuses without enough gold, and says why', () => {
    const inv = new Inventory();
    inv.gold = 5;
    const r = inv.buy('vitality_charm');
    expect(r).toEqual({ ok: false, reason: 'gold' });
    expect(inv.gold).toBe(5);
    expect(shopLine(r)).toMatch(/gold/);
  });

  it('a charm is bought once and gives a permanent bonus', () => {
    const inv = new Inventory();
    inv.earn(200);
    expect(inv.bonus.maxHp).toBe(0);
    expect(inv.buy('vitality_charm').ok).toBe(true);
    expect(inv.bonus.maxHp).toBe(25);
    expect(inv.buy('vitality_charm')).toEqual({ ok: false, reason: 'owned' });
    inv.buy('focus_charm');
    expect(inv.bonus).toEqual({ maxHp: 25, maxMana: 40, manaRegen: 2 });
  });

  it('carries at most a few potions of each kind', () => {
    const inv = new Inventory();
    inv.earn(10_000);
    for (let i = 0; i < MAX_POTIONS; i++) expect(inv.buy('mana_potion').ok).toBe(true);
    expect(inv.buy('mana_potion')).toEqual({ ok: false, reason: 'full' });
  });

  it('the inn costs gold', () => {
    const inv = new Inventory();
    expect(inv.payInn()).toBe(true);
    expect(inv.gold).toBe(STARTING_GOLD - INN_PRICE);
    inv.gold = INN_PRICE - 1;
    expect(inv.payInn()).toBe(false);
  });
});
