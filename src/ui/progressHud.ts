import type { Enemy } from '../enemies/enemy';

/**
 * The climb on screen: an XP strip along the bottom edge with the Incanter's level, the floor
 * number at the top, a big boss bar while a boss lives, and a level-up flourish.
 */
export class ProgressHud {
  private readonly xpEl = document.createElement('div');
  private readonly xpFill: HTMLDivElement;
  private readonly xpText: HTMLSpanElement;
  private readonly floorEl = document.createElement('div');
  private readonly bossEl = document.createElement('div');
  private readonly bossName: HTMLSpanElement;
  private readonly bossFill: HTMLDivElement;
  private readonly bossLag: HTMLDivElement;
  private readonly levelUpEl = document.createElement('div');
  private readonly xpPopEl = document.createElement('div');
  private readonly titleEl = document.createElement('div');
  private titleTimer: number | undefined;
  private lastBoss = -1;
  private bossUid = -1;
  private xpPopTimer: number | undefined;

  constructor(hud: HTMLElement) {
    this.xpEl.className = 'xp-strip';
    this.xpEl.innerHTML = '<div class="xp-fill"></div><span class="xp-text"></span>';
    this.xpFill = this.xpEl.querySelector('.xp-fill') as HTMLDivElement;
    this.xpText = this.xpEl.querySelector('.xp-text') as HTMLSpanElement;

    this.floorEl.className = 'floor-label';

    this.bossEl.className = 'boss-bar';
    this.bossEl.hidden = true;
    this.bossEl.innerHTML = '<span class="boss-name"></span><div class="boss-track"><div class="boss-lag"></div><div class="boss-fill"></div></div>';
    this.bossName = this.bossEl.querySelector('.boss-name') as HTMLSpanElement;
    this.bossFill = this.bossEl.querySelector('.boss-fill') as HTMLDivElement;
    this.bossLag = this.bossEl.querySelector('.boss-lag') as HTMLDivElement;

    this.levelUpEl.className = 'level-up';
    this.levelUpEl.hidden = true;
    this.levelUpEl.setAttribute('role', 'status');

    this.xpPopEl.className = 'xp-pop';
    this.xpPopEl.setAttribute('aria-hidden', 'true');

    this.titleEl.className = 'title-card';
    this.titleEl.hidden = true;
    this.titleEl.setAttribute('role', 'status');

    hud.append(this.xpEl, this.floorEl, this.bossEl, this.levelUpEl, this.xpPopEl, this.titleEl);
  }

  setXp(level: number, fraction: number, xp: number, toNext: number): void {
    this.xpFill.style.width = `${(Math.max(0, Math.min(1, fraction)) * 100).toFixed(1)}%`;
    this.xpText.textContent = `Level ${level} · ${Math.floor(xp)} / ${toNext} XP`;
  }

  /** "+12 XP" floating above the XP strip. */
  xpGained(amount: number): void {
    this.xpPopEl.textContent = `+${amount} XP`;
    this.xpPopEl.classList.remove('xp-pop-on');
    void this.xpPopEl.offsetWidth;
    this.xpPopEl.classList.add('xp-pop-on');
    window.clearTimeout(this.xpPopTimer);
    this.xpPopTimer = window.setTimeout(() => this.xpPopEl.classList.remove('xp-pop-on'), 1200);
  }

  setFloor(floor: number, name: string, boss: boolean): void {
    // Two-tone header: "Floor 3 · " in the accent colour, the name in bold white.
    const strong = document.createElement('strong');
    strong.textContent = name;
    this.floorEl.replaceChildren(`Floor ${floor} · `, strong);
    if (boss) {
      const tag = document.createElement('span');
      tag.className = 'floor-tag';
      tag.textContent = 'Guardian floor';
      this.floorEl.appendChild(tag);
    }
    this.floorEl.classList.toggle('floor-boss', boss);
  }

  /** Big centred card when a floor begins: "FLOOR 3", its name, and a subtitle. */
  titleCard(floor: number, name: string, subtitle: string): void {
    this.titleEl.innerHTML = '';
    const parts: [string, string][] = [
      ['title-card-floor', `Floor ${floor}`],
      ['title-card-name', name],
      ['title-card-sub', subtitle],
    ];
    for (const [cls, text] of parts) {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      this.titleEl.appendChild(d);
    }
    const rule = document.createElement('div');
    rule.className = 'title-card-rule';
    this.titleEl.appendChild(rule);
    this.titleEl.hidden = false;
    this.titleEl.classList.remove('title-card-on');
    void this.titleEl.offsetWidth;
    this.titleEl.classList.add('title-card-on');
    window.clearTimeout(this.titleTimer);
    this.titleTimer = window.setTimeout(() => {
      this.titleEl.hidden = true;
    }, 3600);
  }

  levelUp(level: number, gains: string): void {
    this.levelUpEl.innerHTML = '';
    const big = document.createElement('div');
    big.className = 'level-up-title';
    big.textContent = `Level ${level}`;
    const small = document.createElement('div');
    small.className = 'level-up-gains';
    small.textContent = gains;
    this.levelUpEl.append(big, small);
    this.levelUpEl.hidden = false;
    this.levelUpEl.classList.remove('level-up-on');
    void this.levelUpEl.offsetWidth;
    this.levelUpEl.classList.add('level-up-on');
    window.setTimeout(() => {
      this.levelUpEl.hidden = true;
    }, 2600);
  }

  /** Show the living boss (if any) in the big bar. Returns the boss, so its floating bar can hide. */
  updateBoss(enemies: readonly Enemy[]): Enemy | undefined {
    const boss = enemies.find((e) => e.alive && e.spec.archetype === 'boss');
    this.bossEl.hidden = !boss;
    if (!boss) {
      this.bossUid = -1;
      return undefined;
    }
    if (boss.uid !== this.bossUid) {
      this.bossUid = boss.uid;
      this.bossName.textContent = boss.spec.id;
      this.lastBoss = -1;
    }
    const f = boss.health.fraction;
    if (f !== this.lastBoss) {
      this.lastBoss = f;
      const pct = `${(f * 100).toFixed(1)}%`;
      this.bossFill.style.width = pct;
      this.bossLag.style.width = pct;
      this.bossEl.classList.toggle('boss-enraged', f <= 0.5);
    }
    return boss;
  }
}
