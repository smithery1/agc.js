import Assembler from './assembler'

/**
 * Runs the assembler on the specified URL, which typically points to a MAIN.agc yaYUL formatted file.
 *
 * @param mainUrl the URL of the starting file
 * @returns true iff assembly succeeded without errors
 */
export default async function assemble (mainUrl: string): Promise<boolean> {
  const assembler = new Assembler()
  const result = await assembler.assemble(mainUrl)
  return result
}
