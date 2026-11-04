/** Keyboard + mouse state. Uses physical key codes so WASD works on any layout. */
export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  /** Pointer position in normalised device coordinates (-1..1). */
  readonly pointer = { x: 0, y: 0, active: false };

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Keys held when the text box gains focus would otherwise stay "held" until released.
    window.addEventListener('focusin', (e) => {
      if (isTypingTarget(e.target)) this.clear();
    });
  }

  clear(): void {
    this.held.clear();
    this.pressed.clear();
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** True once per physical press; cleared by endFrame(). */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Movement axes from WASD, each in -1..1 (x = right, y = forward). */
  moveAxes(): { x: number; y: number } {
    const x = (this.isHeld('KeyD') ? 1 : 0) - (this.isHeld('KeyA') ? 1 : 0);
    const y = (this.isHeld('KeyW') ? 1 : 0) - (this.isHeld('KeyS') ? 1 : 0);
    return { x, y };
  }

  endFrame(): void {
    this.pressed.clear();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) return;
    if (e.code === 'Space') e.preventDefault(); // no page scroll
    if (!e.repeat) this.pressed.add(e.code);
    this.held.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private readonly onBlur = (): void => this.clear();

  /** Mouse buttons are reported as "Mouse0" (left), "Mouse2" (right). */
  private readonly onPointerDown = (e: PointerEvent): void => {
    this.onPointerMove(e);
    const code = `Mouse${e.button}`;
    this.pressed.add(code);
    this.held.add(code);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.held.delete(`Mouse${e.button}`);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.pointer.active = true;
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
