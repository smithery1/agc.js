import { compat } from '../common/compat'
import { isStderrSection } from './bootstrap'
import { CharSetType, getCharset } from './charset'
import { isCussInstance } from './cusses'
import { createMemory, Memory } from './memory'
import { createOperations, Operations } from './operations'
import { Options, OutputSection } from './options'
import { Pass1Assembler } from './pass1'
import { Pass2Assembler, Pass2Output } from './pass2'
import * as assembly from './print-assembly'
import * as cells from './print-cells'
import * as symbols from './print-symbol-table'
import { PrintContext, printCuss, Printer } from './printer'

/**
 * The assembler.
 *
 * The assembler runs in two passes.
 * The first pass lexes, parses, and assigns memory locations to all instructions.
 * The second pass generates the binary output.
 *
 * Source code comments reference the various documents below with the abbreviations given.
  * - BTM:
 *     B. Savage and A. Drake,
 *     "ACCG4 Basic Training Manual",
 *     MIT Instrumentation Laboratory, Cambridge, MA,
 *     E-2052, January 1967,
 *     http://www.ibiblio.org/apollo/NARA-SW/E-2052.pdf.
 * - SUNRISE:
 *     R. Battin, R. Crisp, A. Green, T. J. Lawton, C. A. Muntz, J. Rocchio, and E. Smally
 *     "THE'COMPLEAT SUNRISE"
 *     MIT, Cambridge 39, MA,
 *     SUNRISE 33 - NASA DWG #121102, September 1964,
 *     http://www.ibiblio.org/apollo/hrst/archive/1721.pdf
 * - SYM:
 *     "Apollo Guidance Program Symbolic Listing Information for Block 2",
 *     MIT Instrumentation Laboratory, Cambridge, MA,
 *     NAS 9-8166, November 20, 1969,
 *     https://www.ibiblio.org/apollo/Documents/SymbolicListingInformation.pdf.
 * - YUL:
 *     "Apollo Guidance Computer Information Series Issue 13: YUL Programming System",
 *     MIT Instrumentation Laboratory, Cambridge, MA,
 *     FR-2-113, December, 5, 1963,
 *     https://www.ibiblio.org/apollo/Documents/agcis_13_yul.pdf.
 * - yaYUL:
 *     R. Burkey,
 *     "Programmer's Manual: Block 2 AGC Assembly Language",
 *     "General Formatting Information",
 *     https://virtualagc.github.io/virtualagc/assembly_language_manual.html#Formatting.
 *
 * After both passes have run, prints output per the Options passed to it.
 */
export default class Assembler {
  private readonly sectionDispatch = {
    [OutputSection.Cusses]: assembly.printCusses,
    [OutputSection.Listing]: assembly.printListing,
    [OutputSection.ListingWithCusses]: assembly.printListingWithCusses,
    [OutputSection.Symbols]: symbols.printSymbols,
    [OutputSection.UndefinedSymbols]: symbols.printUndefinedSymbols,
    [OutputSection.UnreferencedSymbols]: symbols.printUnreferencedSymbols,
    [OutputSection.CrossReference]: symbols.printCrossReference,
    [OutputSection.TableSummary]: symbols.printTableSummary,
    [OutputSection.MemorySummary]: cells.printMemorySummary,
    [OutputSection.Count]: assembly.printCounts,
    [OutputSection.Paragraphs]: cells.printParagraphs,
    [OutputSection.OctalListing]: cells.printOctalListing,
    [OutputSection.OctalCompact]: cells.printOctalListingCompact,
    [OutputSection.Occupied]: cells.printOccupied,
    [OutputSection.Results]: assembly.printResults
  }

  /**
   * Runs the assembler on the specified URL, which typically points to a MAIN.agc yaYUL formatted file.
   *
   * @param options assemble and output options
   * @returns true iff assembly succeeded without errors
   */
  async assemble (options: Options): Promise<boolean> {
    try {
      const operations = createOperations(options)
      const memory = createMemory(options)
      const pass1 = new Pass1Assembler(operations, memory, options)
      const pass2 = new Pass2Assembler(operations, memory, options)
      const pass1Result = await pass1.assemble(options.file)
      if (isCussInstance(pass1Result)) {
        printCuss(pass1Result)
        return false
      }
      const pass2Result = pass2.assemble(pass1Result)
      this.printOutput(operations, memory, options, pass2Result)
      return pass2Result.fatalCussCount === 0
    } catch (error) {
      compat.log(error.stack)
      return false
    }
  }

  private printOutput (operations: Operations, memory: Memory, options: Options, pass2: Pass2Output): void {
    const program = getProgram(options.file)
    const user = compat.username()
    const printer = new Printer(options, program.version, program.program, user, '0000000-000', options.formatted)
    const charset = getCharset(options.assembler.isYul() ? CharSetType.HONEYWELL_800 : CharSetType.EBCDIC)
    const context: PrintContext = {
      options,
      operations,
      memory,
      printer,
      charset,
      cache: new Map()
    }

    if (options.formatted && options.eol.length > 1) {
      printer.printHeader()
    }

    options.eol.forEach(section => {
      const type = isStderrSection(section)
      printer.stderr(type.isStderr)
      this.sectionDispatch[type.section](pass2, context)
    })
    printer.stderr(false)

    function getProgram (mainUrl: string): { program: string, version: string } {
      const url = new URL(mainUrl)
      // Wait for ES2022, punt on weird URLs for now
      // const pathname = url.pathname.replaceAll(/\/+/g, '/')
      const pathname = url.pathname
      const programMatch = pathname.match(/(?:.*\/)?([^/0-9]+)([0-9]*)\/[^/]+\.agc/)
      if (programMatch === null) {
        return { program: pathname, version: '0' }
      }
      const version = programMatch[2].length === 0 ? '0' : programMatch[2]
      return { program: programMatch[1], version }
    }
  }
}
