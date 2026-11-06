import type { CastResources } from '../combat/mana';
import type { IncantationSpec } from '../schemas/incantationSpec';

const TOAST_TIME = 2.2;

/** Mana bar, the Grimoire bar (keys 1–6) with cooldown sweeps, and a short toast for refused casts. */
export class CastHud {
  private readonly manaFill: HTMLDivElement;
  private readonly manaEl: HTMLDivElement;
  private readonly manaText: HTMLSpanElement;
  private readonly slotsEl = document.createElement('div');
  private readonly toast = document.createElement('div');
  private slots: { spec: IncantationSpec; el: HTMLDivElement; shade: HTMLDivElement; time: HTMLSpanElement; cooling: boolean }[] = [];
  private toastTimer = 0;
  private lastMana = -1;

  constructor(hud: HTMLElement) {
    const mana = document.createElement('div');
    mana.className = 'mana-player';
    mana.innerHTML = '<span class="hp-player-name">Mana</span><div class="hp-track"><div class="hp-fill"></div></div><span class="hp-player-text"></span>';
    hud.appendChild(mana);
    this.manaFill = mana.querySelector('.hp-fill') as HTMLDivElement;
    this.manaEl = mana;
    this.manaText = mana.querySelector('.hp-player-text') as HTMLSpanElement;

    this.slotsEl.className = 'cast-slots';
    hud.appendChild(this.slotsEl);

    this.toast.className = 'cast-toast';
    this.toast.hidden = true;
    hud.appendChild(this.toast);
  }

  /** One entry per bar slot, in key order; undefined = empty slot. */
  setSlots(slots: readonly (IncantationSpec | undefined)[]): void {
    this.slotsEl.replaceChildren();
    this.slots = [];
    slots.forEach((spec, i) => {
      const key = String(i + 1);
      if (!spec) {
        const empty = document.createElement('div');
        empty.className = 'cast-slot cast-empty';
        empty.innerHTML = `<span class="cast-key">${key}</span><span class="cast-name">—</span>`;
        this.slotsEl.appendChild(empty);
        return;
      }
      const el = document.createElement('div');
      el.className = 'cast-slot';
      el.style.setProperty('--accent', spec.vfx.color);
      el.title = `${spec.flavor}\n${spec.type} · ${spec.shape} · ${spec.element} · ${spec.hits}×${spec.damage_per_hit}` +
        (spec.status_effect.kind !== 'none' ? ` · ${spec.status_effect.kind}` : '') +
        (spec.chain_targets ? ` · chains ${spec.chain_targets}` : '');
      const keyEl = document.createElement('span');
      keyEl.className = 'cast-key';
      keyEl.textContent = key;
      const name = document.createElement('span');
      name.className = 'cast-name';
      name.textContent = spec.name;
      const cost = document.createElement('span');
      cost.className = 'cast-cost';
      cost.textContent = `${spec.mana_cost} mana · ${spec.cooldown} s`;
      const shade = document.createElement('div');
      shade.className = 'cast-shade';
      const time = document.createElement('span');
      time.className = 'cast-time';
      el.append(shade, keyEl, name, cost, time);
      this.slotsEl.appendChild(el);
      this.slots.push({ spec, el, shade, time, cooling: false });
    });
  }

  /** Brief message for a refused cast ("not enough mana", "recharging"). */
  say(text: string): void {
    this.toast.textContent = text;
    this.toast.hidden = false;
    this.toastTimer = TOAST_TIME;
  }

  /** Flash a slot when it fires. */
  pulse(name: string): void {
    const s = this.slots.find((x) => x.spec.name === name);
    if (s) this.flashSlot(s.el, 'cast-fired');
  }

  /** Shake the mana bar when a cast is refused for lack of mana. */
  manaShort(): void {
    this.flashSlot(this.manaEl, 'mana-short');
  }

  private flashSlot(el: HTMLElement, cls: string): void {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
  }

  update(dt: number, res: CastResources): void {
    const mana = Math.floor(res.mana);
    if (mana !== this.lastMana) {
      this.lastMana = mana;
      this.manaFill.style.width = `${(res.mana / res.max) * 100}%`;
      this.manaText.textContent = `${mana} / ${res.max}`;
    }
    for (const s of this.slots) {
      const cd = res.cooldown(s.spec.name);
      const cooling = cd.remaining > 0;
      // Clockwise sweep that empties as the cooldown runs out.
      s.el.style.setProperty('--cd', cooling ? (cd.remaining / cd.total).toFixed(3) : '0');
      s.time.textContent = cooling ? (cd.remaining >= 10 ? cd.remaining.toFixed(0) : cd.remaining.toFixed(1)) : '';
      if (s.cooling && !cooling) this.flashSlot(s.el, 'cast-ready'); // ready again
      s.cooling = cooling;
      s.el.classList.toggle('cast-nomana', !cooling && s.spec.mana_cost > res.mana);
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.hidden = true;
    }
  }
}
