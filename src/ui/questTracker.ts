import { ScrollText } from 'lucide';
import { icon } from './icons';
import type { Quest } from '../game/quests';

/** The active quest (top left, under the floor label): title, progress and who gave it. */
export class QuestTracker {
  private readonly el = document.createElement('div');
  private readonly title = document.createElement('strong');
  private readonly detail = document.createElement('span');

  constructor(hud: HTMLElement) {
    this.el.className = 'quest-tracker';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    const badge = document.createElement('span');
    badge.className = 'quest-badge';
    badge.innerHTML = `${icon(ScrollText, 14)} Quest`;
    const text = document.createElement('div');
    text.className = 'quest-text';
    text.append(this.title, this.detail);
    this.el.append(badge, text);
    hud.appendChild(this.el);
  }

  show(q: Quest | undefined): void {
    this.el.hidden = !q;
    this.el.classList.remove('quest-done');
    if (!q) return;
    this.title.textContent = q.goal > 1 ? `${q.title} · ${q.progress}/${q.goal}` : q.title;
    this.detail.textContent = `from the ${q.giver} · +${q.rewardXp} XP · +${Math.round(q.rewardXp / 2)} gold`;
  }

  /** Briefly show a finished quest, then hide. */
  completed(q: Quest): void {
    this.show(q);
    this.title.textContent = `${q.title} · done`;
    this.el.classList.add('quest-done');
    window.setTimeout(() => {
      if (this.el.classList.contains('quest-done')) this.el.hidden = true;
    }, 4000);
  }
}
