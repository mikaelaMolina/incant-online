import { Coins, Droplet, Heart } from 'lucide';
import { icon } from './icons';
import type { PotionKind } from '../game/economy';

/**
 * Gold and potions, as a row inside the unit frame (under the health and mana bars):
 * "coins 45 · Q ♥ 2 · E ✦ 1". Flashes when gold comes in.
 */
export class WalletHud {
  private readonly el = document.createElement('div');
  private readonly gold = document.createElement('span');
  private readonly health = document.createElement('span');
  private readonly mana = document.createElement('span');
  private lastGold = -1;

  constructor(hud: HTMLElement) {
    this.el.className = 'wallet';
    const chip = (cls: string, html: string, value: HTMLSpanElement, title: string): HTMLSpanElement => {
      const c = document.createElement('span');
      c.className = `wallet-chip ${cls}`;
      c.title = title;
      c.innerHTML = html;
      c.appendChild(value);
      return c;
    };
    this.el.append(
      chip('wallet-gold', icon(Coins, 13), this.gold, 'Gold: monsters drop it, quests pay it'),
      chip('wallet-health', `<kbd class="kbd">Q</kbd>${icon(Heart, 12)}`, this.health, 'Health potions (Q to drink)'),
      chip('wallet-mana', `<kbd class="kbd">E</kbd>${icon(Droplet, 12)}`, this.mana, 'Mana potions (E to drink)'),
    );
    (hud.querySelector('.unit-frame .uf-bars') ?? hud).appendChild(this.el);
  }

  set(gold: number, potions: Record<PotionKind, number>): void {
    this.gold.textContent = String(gold);
    this.health.textContent = `×${potions.health}`;
    this.mana.textContent = `×${potions.mana}`;
    if (this.lastGold >= 0 && gold > this.lastGold) {
      this.el.classList.remove('wallet-gain');
      void this.el.offsetWidth;
      this.el.classList.add('wallet-gain');
    }
    this.lastGold = gold;
  }
}
