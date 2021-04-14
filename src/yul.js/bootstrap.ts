import Assembler from './assembler'

export enum Mode {
  Gap,
  Yul
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
  mode: Mode
  eol: EolSection[]
  tableText: boolean
  tableColumnHeaders: boolean
  formatted: boolean
}

/**
 * Runs the assembler on the specified URL, which typically points to a MAIN.agc yaYUL formatted file.
 *
 * @param options assemble and output options
 * @returns true iff assembly succeeded without errors
 */
export default async function assemble (options: Options): Promise<boolean> {
  const assembler = new Assembler(options)
  const result = await assembler.assemble(options)
  return result
}
