import Assembler from './assembler'

export enum YulVersion {
  BLK2,
  Y1966,
  Y1967,
  GAP
}

export function isYul (version: YulVersion): boolean {
  return version === YulVersion.BLK2 || version === YulVersion.Y1966 || version === YulVersion.Y1967
}

export function isGap (version: YulVersion): boolean {
  return version === YulVersion.GAP
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

export interface Options {
  file: string
  yulVersion: YulVersion
  eol: EolSection[]
  formatted: boolean
}

export function asStderrSection (section: EolSection, isStderr: boolean): number {
  return isStderr ? (section | 0x100) : section
}

export function isStderrSection (section: EolSection): { section: EolSection, isStderr: boolean } {
  if ((section & 0x100) > 0) {
    return { section: (section & 0xFF), isStderr: true }
  }
  return { section, isStderr: false }
}

/**
 * Runs the assembler on the specified URL, which typically points to a MAIN.agc yaYUL formatted file.
 *
 * @param options assemble and output options
 * @returns true iff assembly succeeded without errors
 */
export default async function assemble (options: Options): Promise<boolean> {
  const assembler = new Assembler()
  const result = await assembler.assemble(options)
  return result
}
