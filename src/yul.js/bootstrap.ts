import Assembler from './assembler'
import { EolSection, Options } from './options'

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
export async function assemble (options: Options): Promise<boolean> {
  const assembler = new Assembler()
  const result = await assembler.assemble(options)
  return result
}
