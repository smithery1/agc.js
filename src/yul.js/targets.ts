export enum Enum {
  RAY,
  YAGC4,
  B1965,
  B1966,
  Y1966,
  Y1967,
  GAP
}

export function parseTarget (target: string): Target | undefined {
  const targetEnum = Enum[target]
  if (targetEnum === undefined) {
    return undefined
  }

  return new Target(targetEnum)
}

export function createTarget (version: Enum): Target {
  return new Target(version)
}

export class Target {
  constructor (private readonly targetEnum: Enum) {
  }

  target (): Enum {
    return this.targetEnum
  }

  isBlock1 (): boolean {
    return this.targetEnum === Enum.YAGC4
  }

  isBlock2 (): boolean {
    return !this.isBlock1()
  }

  isBlk2 (): boolean {
    return this.targetEnum >= Enum.B1965 && this.targetEnum <= Enum.B1966
  }

  isYul (): boolean {
    return this.targetEnum !== Enum.RAY && this.targetEnum <= Enum.Y1967
  }

  isGap (): boolean {
    return this.targetEnum === Enum.GAP
  }

  isRaytheon (): boolean {
    return this.targetEnum === Enum.RAY
  }

  isLaterThan (test: Enum): boolean {
    return this.isRaytheon() ? false : this.targetEnum > test
  }

  isAtMost (test: Enum): boolean {
    const testIsSuper = test === Enum.RAY
    if (this.isRaytheon()) {
      return testIsSuper
    } else if (testIsSuper) {
      return false
    } else {
      return this.targetEnum <= test
    }
  }
}
