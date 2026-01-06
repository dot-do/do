export interface ConcurrencyControllerOptions {
  /** Initial concurrency level (default: 20) */
  initial?: number
  /** Maximum concurrency (default: 100) */
  max?: number
  /** Minimum concurrency (default: 1) */
  min?: number
  /** Success streak needed to increase (default: 10) */
  successStreakThreshold?: number
  /** Multiplier for success increase (default: 1.25) */
  successMultiplier?: number
  /** Multiplier for rate limit decrease (default: 0.5) */
  rateLimitMultiplier?: number
  /** Multiplier for other error decrease (default: 0.75) */
  errorMultiplier?: number
  /** Callback when concurrency changes */
  onAdjust?: (newValue: number) => void
}

export class ConcurrencyController {
  private _current: number
  private _successStreak = 0
  private readonly options: Required<Omit<ConcurrencyControllerOptions, 'onAdjust'>> &
    Pick<ConcurrencyControllerOptions, 'onAdjust'>

  constructor(options: ConcurrencyControllerOptions = {}) {
    this.options = {
      initial: options.initial ?? 20,
      max: options.max ?? 100,
      min: options.min ?? 1,
      successStreakThreshold: options.successStreakThreshold ?? 10,
      successMultiplier: options.successMultiplier ?? 1.25,
      rateLimitMultiplier: options.rateLimitMultiplier ?? 0.5,
      errorMultiplier: options.errorMultiplier ?? 0.75,
      onAdjust: options.onAdjust,
    }
    this._current = this.options.initial
  }

  get current(): number {
    return this._current
  }

  get successStreak(): number {
    return this._successStreak
  }

  recordSuccess(): void {
    this._successStreak++
    if (this._successStreak >= this.options.successStreakThreshold) {
      this.adjustConcurrency(this.options.successMultiplier)
      this._successStreak = 0
    }
  }

  recordError(error: Error): void {
    this._successStreak = 0
    const status = (error as any).status
    const multiplier = status === 429 ? this.options.rateLimitMultiplier : this.options.errorMultiplier
    this.adjustConcurrency(multiplier)
  }

  private adjustConcurrency(multiplier: number): void {
    const newValue = Math.floor(this._current * multiplier)
    this._current = Math.max(this.options.min, Math.min(this.options.max, newValue))
    this.options.onAdjust?.(this._current)
  }

  canProceed(currentInFlight: number): boolean {
    return currentInFlight < this._current
  }

  reset(): void {
    this._current = this.options.initial
    this._successStreak = 0
  }
}
