import {
  Castle,
  Feather,
  Flame,
  House,
  Keyboard,
  Landmark,
  ListChecks,
  Moon,
  MountainSnow,
  Orbit,
  ShieldCheck,
  Skull,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Swords,
  Tent,
  Trees,
  UserX,
  WandSparkles,
  type IconNode,
} from 'lucide';
import { icon } from './icons';
import { MIC_ICON } from './micIcon';
import { MAX_UTTERANCE_LENGTH } from '../voice/utterance';
import type { VoiceMode, VoiceState } from '../voice/speechInput';

/** One-click starting worlds: still the player's words, just pre-written. */
const QUICK_WORLDS = ['a frozen castle', 'a misty forest at night', 'desert ruins at dusk'] as const;

/**
 * "Choose" setup: the player's picks are composed into a plain-language description, which goes
 * through the same build path as spoken or typed words (the LLM still turns words into the world).
 */
interface Choice {
  id: string;
  label: string;
  icon: IconNode;
  words: string;
}
const PLACES: Choice[] = [
  { id: 'forest', label: 'Forest', icon: Trees, words: 'an enchanted forest' },
  { id: 'castle', label: 'Castle', icon: Castle, words: 'a castle and its ramparts' },
  { id: 'ice', label: 'Frozen peaks', icon: MountainSnow, words: 'frozen peaks of ice and snow' },
  { id: 'desert', label: 'Desert', icon: Sun, words: 'desert dunes and sandstone ruins' },
  { id: 'cavern', label: 'Volcano', icon: Flame, words: 'a volcanic cavern of lava and ash' },
  { id: 'ruins', label: 'Ruins', icon: Landmark, words: 'ancient overgrown ruins' },
  { id: 'void', label: 'The Void', icon: Orbit, words: 'a starry void between worlds' },
];
const TIMES: Choice[] = [
  { id: 'dawn', label: 'Dawn', icon: Sunrise, words: 'at dawn' },
  { id: 'day', label: 'Day', icon: Sun, words: 'in bright daylight' },
  { id: 'dusk', label: 'Dusk', icon: Sunset, words: 'at dusk' },
  { id: 'night', label: 'Night', icon: Moon, words: 'at night' },
];
const DANGERS: Choice[] = [
  { id: 'calm', label: 'Calm', icon: Feather, words: 'with only a few weak monsters' },
  { id: 'normal', label: 'Normal', icon: Swords, words: 'guarded by monsters' },
  { id: 'deadly', label: 'Deadly', icon: Skull, words: 'swarming with fierce monsters' },
];
const PEOPLE: Choice[] = [
  { id: 'village', label: 'A village', icon: House, words: 'with a small village of friendly villagers to talk to' },
  { id: 'travellers', label: 'Travellers', icon: Tent, words: 'with a couple of friendly travellers to talk to' },
  { id: 'none', label: 'No one', icon: UserX, words: 'with no one else around' },
];

/** The description sent to the Spire for a set of picks. */
export function describeChoices(picks: { place: string; time: string; danger: string; people: string }): string {
  const find = (list: Choice[], id: string): string => (list.find((c) => c.id === id) ?? list[0]!).words;
  return `${find(PLACES, picks.place)} ${find(TIMES, picks.time)}, ${find(DANGERS, picks.danger)}, ${find(PEOPLE, picks.people)}`;
}

function choiceGroup(name: string, title: string, list: Choice[], selected: string): string {
  return `<fieldset class="start-choice" data-group="${name}">
    <legend>${title}</legend>
    <div class="start-choice-row">
      ${list
        .map(
          (c) => `<button type="button" class="start-pick" data-value="${c.id}" aria-pressed="${c.id === selected}">
            ${icon(c.icon, 22)}<span>${c.label}</span></button>`,
        )
        .join('')}
    </div>
  </fieldset>`;
}

/**
 * Title screen. The player enters by speaking (hold V or the mic) or typing the world they want;
 * that description builds floor 1. Carries the microphone explanation and the privacy notice
 * required by CLAUDE.md.
 */
export class StartScreen {
  readonly el = document.createElement('section');
  readonly micButton: HTMLButtonElement;
  private readonly input: HTMLInputElement;
  private readonly buildButton: HTMLButtonElement;
  private readonly heard: HTMLParagraphElement;
  private readonly status: HTMLParagraphElement;
  private readonly permission: HTMLSpanElement;
  private entering = false;
  private busy = false;
  onEnter: (() => void) | undefined;
  /** The player described a world (typed, or a quick pick). Spoken words arrive through the voice pipeline. */
  onWorld: ((text: string) => void) | undefined;

  constructor(parent: HTMLElement, voiceMode: VoiceMode) {
    this.el.className = 'start-screen';
    this.el.setAttribute('aria-labelledby', 'start-title');
    const voice = voiceMode !== 'none';
    const fallbackNote =
      voiceMode === 'recorder'
        ? '<p>No speech recognition in this browser: clips go to our server for text, then are deleted.</p>'
        : '';

    this.el.innerHTML = `
      <div class="start-shell">
        <header class="start-top">
          <div class="start-brand">
            <span class="start-logo">${icon(WandSparkles, 20)}</span>
            <span id="start-title">Incant Online</span>
          </div>
          <span class="badge start-browser">Chrome · Edge</span>
        </header>

        <section class="card start-hero">
          <div class="start-art" aria-hidden="true">${icon(Sparkles, 64)}</div>
          <h1>Say it.<br />Cast it.</h1>
          <div class="start-tabs" role="tablist" aria-label="How to make your world">
            <button type="button" role="tab" class="start-tab" data-tab="describe" aria-selected="true">${icon(Keyboard, 16)} Describe it</button>
            <button type="button" role="tab" class="start-tab" data-tab="choose" aria-selected="false">${icon(ListChecks, 16)} Choose it</button>
          </div>
          <form class="start-world" data-panel="describe" autocomplete="off">
            <label class="start-hold" for="start-world-input">${voice ? 'Hold <kbd class="kbd">V</kbd> and describe your world, or type it' : 'Describe your world'}</label>
            <div class="start-world-row">
              ${voice ? `<button type="button" class="btn mic-button mic-large" aria-label="Hold to speak">${MIC_ICON}</button>` : ''}
              <input id="start-world-input" class="input start-world-input" type="text" spellcheck="false"
                maxlength="${MAX_UTTERANCE_LENGTH}" placeholder="a volcano fortress at dusk…" />
              <button type="submit" class="btn start-build" data-size="lg">Build</button>
            </div>
            <div class="start-quick">
              <span>Try</span>
              ${QUICK_WORLDS.map((w) => `<button type="button" class="badge start-quick-pick">${w}</button>`).join('')}
            </div>
          </form>
          <div class="start-chooser" data-panel="choose" hidden>
            ${choiceGroup('place', 'Where', PLACES, 'forest')}
            ${choiceGroup('time', 'When', TIMES, 'day')}
            <div class="start-choice-pair">
              ${choiceGroup('danger', 'Danger', DANGERS, 'normal')}
              ${choiceGroup('people', 'Who lives there', PEOPLE, 'village')}
            </div>
            <div class="start-chooser-foot">
              <p class="start-chooser-preview"></p>
              <button type="button" class="btn start-build-choice" data-size="lg">Build this world</button>
            </div>
          </div>
          <p class="start-heard" aria-live="polite">${voice ? '' : 'No voice in this browser. Type instead.'}</p>
          <p class="start-status" aria-live="polite">Loading…</p>
        </section>

        <div class="start-steps">
          <div class="start-step forge">${icon(Flame, 22)}<strong>Forge</strong><span>“fire spin”</span></div>
          <div class="start-step recite">${icon(WandSparkles, 22)}<strong>Recite</strong><span>say its name</span></div>
          <div class="start-step build">${icon(Castle, 22)}<strong>Build</strong><span>“frozen castle”</span></div>
        </div>

        <div class="start-row">
          <section class="card start-notes">
            <span class="start-notes-icon">${icon(ShieldCheck, 18)}</span>
            <div>
              <p><strong>Push-to-talk only.</strong> Browser speech recognition may send audio to your browser vendor (e.g. Google). We never store audio. The Arbiter's voice is AI-generated, not a human. <span class="start-permission"></span></p>
              ${fallbackNote}
            </div>
          </section>
          <section class="card start-keys" aria-label="Controls">
            <span><kbd class="kbd">WASD</kbd>move</span>
            <span><kbd class="kbd">Click</kbd>strike</span>
            <span><kbd class="kbd">Space</kbd>dodge</span>
            <span><kbd class="kbd">V</kbd>talk</span>
            <span><kbd class="kbd">Enter</kbd>type</span>
          </section>
        </div>
      </div>`;
    parent.appendChild(this.el);

    this.micButton = (this.el.querySelector('.mic-large') as HTMLButtonElement | null) ?? document.createElement('button');
    this.input = this.el.querySelector('.start-world-input') as HTMLInputElement;
    this.buildButton = this.el.querySelector('.start-build') as HTMLButtonElement;
    this.heard = this.el.querySelector('.start-heard') as HTMLParagraphElement;
    this.status = this.el.querySelector('.start-status') as HTMLParagraphElement;
    this.permission = this.el.querySelector('.start-permission') as HTMLSpanElement;

    const form = this.el.querySelector('.start-world') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit(this.input.value);
    });
    this.input.addEventListener('keydown', (e) => e.stopPropagation()); // typing never moves the Incanter
    for (const pick of this.el.querySelectorAll<HTMLButtonElement>('.start-quick-pick')) {
      pick.addEventListener('click', () => {
        this.input.value = pick.textContent ?? '';
        this.submit(this.input.value);
      });
    }
    this.wireChooser();
    void this.showPermissionState();
    // No focus on the text box: holding V must start listening, not type "vvv" into it.
    // (Clicking the box types; push-to-talk ignores keys typed into text boxes.)
  }

  /** Tabs (describe / choose), the pick buttons and the composed description. */
  private wireChooser(): void {
    const picks = { place: 'forest', time: 'day', danger: 'normal', people: 'village' };
    const preview = this.el.querySelector('.start-chooser-preview') as HTMLParagraphElement;
    const showPreview = (): void => {
      preview.textContent = `“${describeChoices(picks)}”`;
    };
    for (const tab of this.el.querySelectorAll<HTMLButtonElement>('.start-tab')) {
      tab.addEventListener('click', () => {
        for (const t of this.el.querySelectorAll<HTMLButtonElement>('.start-tab')) t.setAttribute('aria-selected', String(t === tab));
        for (const panel of this.el.querySelectorAll<HTMLElement>('[data-panel]')) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
        // (no focus on the text box: V should keep working as push-to-talk)
      });
    }
    for (const group of this.el.querySelectorAll<HTMLFieldSetElement>('.start-choice')) {
      const name = group.dataset.group as keyof typeof picks;
      for (const btn of group.querySelectorAll<HTMLButtonElement>('.start-pick')) {
        btn.addEventListener('click', () => {
          picks[name] = btn.dataset.value ?? picks[name];
          for (const b of group.querySelectorAll<HTMLButtonElement>('.start-pick')) b.setAttribute('aria-pressed', String(b === btn));
          showPreview();
        });
      }
    }
    (this.el.querySelector('.start-build-choice') as HTMLButtonElement).addEventListener('click', () => this.submit(describeChoices(picks)));
    showPreview();
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  setReady(): void {
    if (!this.busy) this.status.textContent = 'Ready. Describe your world to enter.';
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  /** While a world is being built: inputs off so one description at a time goes through. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    for (const el of [this.input, this.buildButton, ...this.el.querySelectorAll<HTMLButtonElement>('.start-quick-pick, .start-build-choice, .start-pick')]) el.disabled = busy;
    // Not refocusing the text box here either: V would type instead of listening.
  }

  setVoiceState(state: VoiceState): void {
    this.micButton.dataset.state = state;
    if (state === 'listening') this.heard.textContent = 'Listening…';
  }

  /** Interim or final words, or an in-character reply. */
  showHeard(text: string): void {
    this.heard.textContent = text;
  }

  /** Leave the title screen. `instant` when the reshape curtain already covers it. */
  enter(instant = false): void {
    if (this.entering) return;
    this.entering = true;
    if (this.el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    if (instant) {
      this.el.hidden = true;
    } else {
      this.el.classList.add('leaving');
      window.setTimeout(() => {
        this.el.hidden = true;
      }, 450);
    }
    this.onEnter?.();
  }

  private submit(raw: string): void {
    const text = raw.trim();
    if (!text || this.busy) return;
    this.onWorld?.(text);
  }

  private async showPermissionState(): Promise<void> {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const render = (): void => {
        this.permission.textContent =
          status.state === 'granted'
            ? 'Mic allowed.'
            : status.state === 'denied'
              ? 'Mic blocked: allow it in the address bar, or type.'
              : '';
      };
      render();
      status.onchange = render;
    } catch {
      // Permissions API not available for microphone (e.g. Firefox): nothing to show.
    }
  }
}
