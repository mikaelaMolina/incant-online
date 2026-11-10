import { Coins, Store, X } from 'lucide';
import { icon } from './icons';
import { SHOP_ITEMS, type BuyResult, type Inventory, type ItemId } from '../game/economy';

/** The Merchant's stall: items, prices and Buy buttons. Opened with F next to the Merchant. */
export class ShopPanel {
  private readonly el = document.createElement('div');
  private readonly goldEl = document.createElement('span');
  private readonly list = document.createElement('div');
  private inventory: Inventory | undefined;
  /** Buying goes through the game (charms change your stats). */
  onBuy: ((id: ItemId) => BuyResult) | undefined;
  onClose: (() => void) | undefined;

  constructor(parent: HTMLElement) {
    this.el.className = 'card shop-panel';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', "The Merchant's stall");

    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.innerHTML = `${icon(Store, 20)} The Merchant's stall`;
    const gold = document.createElement('p');
    gold.className = 'shop-gold';
    gold.innerHTML = `${icon(Coins, 14)} `;
    gold.append(this.goldEl, ' gold');
    const close = document.createElement('button');
    close.className = 'btn card-action shop-close';
    close.type = 'button';
    close.dataset.variant = 'ghost';
    close.dataset.size = 'icon-sm';
    close.innerHTML = icon(X, 16);
    close.setAttribute('aria-label', 'Close the stall');
    close.addEventListener('click', () => this.show(false));
    header.append(title, gold, close);

    this.list.className = 'shop-list';
    this.el.append(header, this.list);
    parent.appendChild(this.el);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible) this.show(false);
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(open: boolean, inventory?: Inventory): void {
    if (inventory) this.inventory = inventory;
    const was = this.visible;
    this.el.hidden = !open;
    if (open) this.render();
    if (was && !open) this.onClose?.();
  }

  render(): void {
    const inv = this.inventory;
    if (!inv) return;
    this.goldEl.textContent = String(inv.gold);
    this.list.replaceChildren();
    for (const item of SHOP_ITEMS) {
      const row = document.createElement('div');
      row.className = `shop-item shop-${item.kind}`;
      const text = document.createElement('div');
      text.className = 'shop-text';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const desc = document.createElement('span');
      const owned = item.kind === 'charm' && inv.charms.has(item.id);
      const carried = item.kind === 'potion' ? inv.potions[item.id === 'mana_potion' ? 'mana' : 'health'] : 0;
      desc.textContent = owned ? 'Worn: its magic is yours.' : carried ? `${item.description} (you carry ${carried})` : item.description;
      text.append(name, desc);
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'btn shop-buy';
      const check = inv.check(item.id);
      buy.disabled = !check.ok;
      buy.innerHTML = owned ? 'Owned' : `${icon(Coins, 13)} ${item.price}`;
      buy.title = check.ok ? `Buy ${item.name}` : check.reason === 'gold' ? 'Not enough gold' : check.reason === 'full' ? 'Your bag is full' : 'Already yours';
      buy.addEventListener('click', () => {
        this.onBuy?.(item.id);
        this.render();
      });
      row.append(text, buy);
      this.list.appendChild(row);
    }
  }
}
