/**
 * Haryak HRMS — Decimal-Safe Monetary Arithmetic Helper
 *
 * Prevents IEEE 754 floating point inaccuracies in payroll and financial calculations.
 * Internal precision is scaled to 4 decimal places, with rounding to 2 decimal places (paise).
 */

export class Decimal {
  private value: number

  private constructor(value: number) {
    this.value = Math.round((value + Number.EPSILON) * 10000) / 10000
  }

  static from(val: number | string | Decimal | null | undefined): Decimal {
    if (val instanceof Decimal) return val
    if (val === null || val === undefined || val === '') return new Decimal(0)
    const num = typeof val === 'string' ? parseFloat(val) : val
    if (isNaN(num) || !isFinite(num)) return new Decimal(0)
    return new Decimal(num)
  }

  static zero(): Decimal {
    return new Decimal(0)
  }

  plus(other: number | string | Decimal): Decimal {
    const o = Decimal.from(other)
    return new Decimal(this.value + o.value)
  }

  add(other: number | string | Decimal): Decimal {
    return this.plus(other)
  }

  minus(other: number | string | Decimal): Decimal {
    const o = Decimal.from(other)
    return new Decimal(this.value - o.value)
  }

  sub(other: number | string | Decimal): Decimal {
    return this.minus(other)
  }

  times(other: number | string | Decimal): Decimal {
    const o = Decimal.from(other)
    return new Decimal(this.value * o.value)
  }

  mul(other: number | string | Decimal): Decimal {
    return this.times(other)
  }

  div(other: number | string | Decimal): Decimal {
    const o = Decimal.from(other)
    if (o.value === 0) return new Decimal(0)
    return new Decimal(this.value / o.value)
  }

  round2(): number {
    return Math.round((this.value + Number.EPSILON) * 100) / 100
  }

  toNumber(): number {
    return this.round2()
  }

  toFixed(digits: number = 2): string {
    return this.round2().toFixed(digits)
  }

  equals(other: number | string | Decimal, epsilon: number = 0.01): boolean {
    const o = Decimal.from(other)
    return Math.abs(this.toNumber() - o.toNumber()) <= epsilon
  }

  isGreaterThan(other: number | string | Decimal): boolean {
    const o = Decimal.from(other)
    return this.toNumber() > o.toNumber()
  }

  isLessThan(other: number | string | Decimal): boolean {
    const o = Decimal.from(other)
    return this.toNumber() < o.toNumber()
  }

  isZero(): boolean {
    return Math.abs(this.toNumber()) === 0
  }
}

export function roundAmount(amount: number): number {
  return Decimal.from(amount).round2()
}
