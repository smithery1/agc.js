export interface Options {
  file: string
  source: Source
  assembler: Assembler
  eol: EolSection[]
  formatted: boolean
}

export enum EolSection {
  Listing,
  ListingWithCusses,
  Cusses,
  Symbols,
  UndefinedSymbols,
  UnreferencedSymbols,
  CrossReference,
  TableSummary,
  MemorySummary,
  Count,
  Paragraphs,
  OctalListing,
  OctalCompact,
  Occupied,
  Results
}

export enum AssemblerEnum {
  RAY,
  Y1965,
  N1966,
  D1966,
  Y1967,
  GAP
}

export function parseAssembler (assembler: string): Assembler | undefined {
  const assemblerEnum = AssemblerEnum[assembler]
  if (assemblerEnum === undefined) {
    return undefined
  }

  return new Assembler(assemblerEnum)
}

export function createAssembler (version: AssemblerEnum): Assembler {
  return new Assembler(version)
}

export function createMatchingAssembler (source: SourceEnum): Assembler {
  switch (source) {
    case SourceEnum.RAY:
      return new Assembler(AssemblerEnum.RAY)

    case SourceEnum.AGC4:
      return new Assembler(AssemblerEnum.D1966)

    case SourceEnum.B1965:
      return new Assembler(AssemblerEnum.Y1965)

    case SourceEnum.B1966:
      return new Assembler(AssemblerEnum.N1966)

    case SourceEnum.A1966:
      return new Assembler(AssemblerEnum.D1966)

    case SourceEnum.A1967:
      return new Assembler(AssemblerEnum.Y1967)

    case SourceEnum.AGC:
      return new Assembler(AssemblerEnum.GAP)
  }
}

export class Assembler {
  constructor (private readonly assemblerEnum: AssemblerEnum) {
  }

  assembler (): AssemblerEnum {
    return this.assemblerEnum
  }

  isYul (): boolean {
    return this.assemblerEnum !== AssemblerEnum.RAY && this.assemblerEnum !== AssemblerEnum.GAP
  }

  isGap (): boolean {
    return this.assemblerEnum === AssemblerEnum.GAP
  }

  isRaytheon (): boolean {
    return this.assemblerEnum === AssemblerEnum.RAY
  }

  isLaterThan (test: AssemblerEnum): boolean {
    return this.isRaytheon() ? false : this.assemblerEnum > test
  }

  isAtMost (test: AssemblerEnum): boolean {
    const testIsSuper = test === AssemblerEnum.RAY
    if (this.isRaytheon()) {
      return testIsSuper
    } else if (testIsSuper) {
      return false
    } else {
      return this.assemblerEnum <= test
    }
  }
}

export enum SourceEnum {
  RAY,
  AGC4,
  B1965,
  B1966,
  A1966,
  A1967,
  AGC
}

export function parseSource (source: string): Source | undefined {
  const sourceEnum = SourceEnum[source]
  if (sourceEnum === undefined) {
    return undefined
  }

  return new Source(sourceEnum)
}

export function createSource (version: SourceEnum): Source {
  return new Source(version)
}

export class Source {
  constructor (private readonly sourceEnum: SourceEnum) {
  }

  source (): SourceEnum {
    return this.sourceEnum
  }

  isBlock1 (): boolean {
    return this.sourceEnum === SourceEnum.AGC4
  }

  isBlock2 (): boolean {
    return !this.isBlock1()
  }

  isBlk2 (): boolean {
    return this.sourceEnum >= SourceEnum.B1965 && this.sourceEnum <= SourceEnum.B1966
  }

  isYul (): boolean {
    return this.sourceEnum !== SourceEnum.RAY && this.sourceEnum <= SourceEnum.A1967
  }

  isAgc (): boolean {
    return this.sourceEnum === SourceEnum.AGC
  }

  isRaytheon (): boolean {
    return this.sourceEnum === SourceEnum.RAY
  }

  onlyPositiveChecksums (): boolean {
    return this.sourceEnum === SourceEnum.B1966 || this.sourceEnum === SourceEnum.A1966
  }
}
