/** Hit points with clamping. Shared by the Incanter and enemies. */
export class Health {
  current: number;

  constructor(public max: number) {
    this.current = max;
  }

  get fraction(): number {
    return this.max > 0 ? this.current / this.max : 0;
  }

  get dead(): boolean {
    return this.current <= 0;
  }

  /** Returns the damage actually dealt. */
  damage(amount: number): number {
    if (this.dead || amount <= 0) return 0;
    const dealt = Math.min(this.current, amount);
    this.current -= dealt;
    return dealt;
  }

  heal(amount: number): void {
    if (this.dead) return;
    this.current = Math.min(this.max, this.current + Math.max(0, amount));
  }

  reset(max = this.max): void {
    this.max = max;
    this.current = max;
  }
}
