export enum Enum {
  RAY,
  B1965,
  B1966,
  Y1966,
  Y1967,
  GAP
}

export function parseVersion (version: string): Version | undefined {
  const versionEnum = Enum[version]
  if (version === undefined) {
    return undefined
  }

  return new Version(versionEnum)
}

export function createVersion (version: Enum): Version {
  return new Version(version)
}

export class Version {
  constructor (private readonly versionEnum: Enum) {
  }

  version (): Enum {
    return this.versionEnum
  }

  isBlk2 (): boolean {
    return this.versionEnum !== Enum.RAY && this.versionEnum <= Enum.B1966
  }

  isYul (): boolean {
    return this.versionEnum !== Enum.RAY && this.versionEnum <= Enum.Y1967
  }

  isYulNonBlk2 (): boolean {
    return this.isYul() && !this.isBlk2()
  }

  isGap (): boolean {
    return this.versionEnum === Enum.GAP
  }

  isRaytheon (): boolean {
    return this.versionEnum === Enum.RAY
  }

  isLaterThan (test: Enum): boolean {
    return this.isRaytheon() ? false : this.versionEnum > test
  }

  isAtMost (test: Enum): boolean {
    const testIsSuper = test === Enum.RAY
    if (this.isRaytheon()) {
      return testIsSuper
    } else if (testIsSuper) {
      return false
    } else {
      return this.versionEnum <= test
    }
  }
}
