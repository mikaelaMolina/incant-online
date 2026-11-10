/**
 * The village economy: gold, the Merchant's wares, potions and charms, the inn. Pure (no
 * three.js), so it is unit-tested. Monsters drop gold, quests pay gold, the Merchant sells
 * potions (drunk with Q / E) and charms (permanent stat bonuses), the Innkeeper sells a rest.
 */

/** Gold per kill, by archetype. */
export const GOLD_FOR = { melee: 4, ranged: 5, tank: 10, boss: 50 } as const;
/** Enough for one potion in the prologue village. */
export const STARTING_GOLD = 30;
export const INN_PRICE = 10;

export type PotionKind = 'health' | 'mana';
export type ItemId = 'health_potion' | 'mana_potion' | 'vitality_charm' | 'focus_charm';

export interface ShopItem {
  id: ItemId;
  name: string;
  price: number;
  kind: 'potion' | 'charm';
  description: string;
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'health_potion', name: 'Health Potion', price: 25, kind: 'potion', description: 'Restores half your health. Q to drink.' },
  { id: 'mana_potion', name: 'Mana Potion', price: 20, kind: 'potion', description: 'Restores half your mana. E to drink.' },
  { id: 'vitality_charm', name: 'Vitality Charm', price: 80, kind: 'charm', description: '+25 maximum health, for good.' },
  { id: 'focus_charm', name: 'Focus Charm', price: 80, kind: 'charm', description: '+40 maximum mana and faster mana.' },
];

/** Most potions of one kind you can carry. */
export const MAX_POTIONS = 5;

export type BuyResult = { ok: true; item: ShopItem } | { ok: false; reason: 'gold' | 'owned' | 'full' | 'unknown' };

export class Inventory {
  gold = STARTING_GOLD;
  readonly potions: Record<PotionKind, number> = { health: 0, mana: 0 };
  readonly charms = new Set<ItemId>();

  earn(amount: number): void {
    if (amount > 0) this.gold += Math.round(amount);
  }

  /** Can this item be bought right now? */
  check(id: ItemId): BuyResult {
    const item = SHOP_ITEMS.find((i) => i.id === id);
    if (!item) return { ok: false, reason: 'unknown' };
    if (item.kind === 'charm' && this.charms.has(id)) return { ok: false, reason: 'owned' };
    if (item.kind === 'potion' && this.potions[potionOf(id)] >= MAX_POTIONS) return { ok: false, reason: 'full' };
    if (this.gold < item.price) return { ok: false, reason: 'gold' };
    return { ok: true, item };
  }

  buy(id: ItemId): BuyResult {
    const r = this.check(id);
    if (!r.ok) return r;
    this.gold -= r.item.price;
    if (r.item.kind === 'charm') this.charms.add(id);
    else this.potions[potionOf(id)]++;
    return r;
  }

  /** Take a potion from the bag; false if there is none. */
  usePotion(kind: PotionKind): boolean {
    if (this.potions[kind] <= 0) return false;
    this.potions[kind]--;
    return true;
  }

  /** Pay for a night at the inn; false if you can't afford it. */
  payInn(): boolean {
    if (this.gold < INN_PRICE) return false;
    this.gold -= INN_PRICE;
    return true;
  }

  /** Permanent bonuses from charms (added to the level's stats). */
  get bonus(): { maxHp: number; maxMana: number; manaRegen: number } {
    return {
      maxHp: this.charms.has('vitality_charm') ? 25 : 0,
      maxMana: this.charms.has('focus_charm') ? 40 : 0,
      manaRegen: this.charms.has('focus_charm') ? 2 : 0,
    };
  }
}

function potionOf(id: ItemId): PotionKind {
  return id === 'mana_potion' ? 'mana' : 'health';
}

/** The Merchant's line for a purchase attempt (shown and spoken). */
export function shopLine(r: BuyResult): string {
  if (r.ok) return r.item.kind === 'charm' ? `The ${r.item.name}. Wear it well, Incanter.` : `One ${r.item.name}. Drink it when the fight turns.`;
  switch (r.reason) {
    case 'gold':
      return 'Not enough gold, Incanter. The Spire pays those who climb it.';
    case 'owned':
      return 'You already wear that charm. One is all its magic allows.';
    case 'full':
      return 'Your bag holds no more of those. Drink one first.';
    default:
      return 'I have nothing by that name.';
  }
}

/** The Innkeeper's lines. */
export const INN_LINES = {
  rested: 'Rest well, Incanter. The fire kept watch, and you wake whole again.',
  poor: 'Ten gold a night, Incanter, and your purse is lighter than that. Come back after a climb.',
} as const;

/** Every line the Merchant and Innkeeper can say about a sale or a rest (for pre-recording). */
export function tradeLines(): string[] {
  const sales = SHOP_ITEMS.map((item) => shopLine({ ok: true, item }));
  const refusals = (['gold', 'owned', 'full'] as const).map((reason) => shopLine({ ok: false, reason }));
  return [...sales, ...refusals, INN_LINES.rested, INN_LINES.poor];
}
