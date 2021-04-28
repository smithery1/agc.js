import { compat } from '../common/compat'
import { EolSection, isStderrSection, isYul, Options } from './bootstrap'
import { CharSetType, getCharset } from './charset'
import { isCussInstance } from './cusses'
import { createMemory, Memory } from './memory'
import { createOperations, Operations } from './operations'
import { Pass1Assembler } from './pass1'
import { Pass2Assembler, Pass2Output } from './pass2'
import * as assembly from './print-assembly'
import * as cells from './print-cells'
import * as symbols from './print-symbol-table'
import { PrintContext, printCuss, PrinterContext } from './printer-utils'

/**
 * The assembler.
 *
 * The assembler runs in two passes.
 * The first pass assigns memory locations to all instructions.
 * The second pass evaluates address fields and generates the binary output.
 *
 * Source code comments reference the various documents below with the abbreviations given.
  * - BTM:
 *     B. Savage and A. Drake,
 *     "ACCG4 Basic Training Manual",
 *     MIT Instrumentation Laboratory, Cambridge, MA,
 *     E-2052, January 1967,
 *     http://www.ibiblio.org/apollo/NARA-SW/E-2052.pdf.
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
 *     R\. Burkey,
 *     "Programmer's Manual: Block 2 AGC Assembly Language",
 *     "General Formatting Information",
 *     https://virtualagc.github.io/virtualagc/assembly_language_manual.html#Formatting.
 *
 * After both passes have run, prints the following.
 * All output mimics the YUL output of the same type.
 * - The assembly, with any errors inline
 * - The symbol table and unreferenced symbols list
 * - The cell contents
 */
export default class Assembler {
  private readonly sectionDispatch = {
    [EolSection.Cusses]: assembly.printCusses,
    [EolSection.Listing]: assembly.printListing,
    [EolSection.ListingWithCusses]: assembly.printListingWithCusses,
    [EolSection.Symbols]: symbols.printSymbols,
    [EolSection.UndefinedSymbols]: symbols.printUndefinedSymbols,
    [EolSection.UnreferencedSymbols]: symbols.printUnreferencedSymbols,
    [EolSection.CrossReference]: symbols.printCrossReference,
    [EolSection.TableSummary]: symbols.printTableSummary,
    [EolSection.MemorySummary]: cells.printMemorySummary,
    [EolSection.Count]: assembly.printCounts,
    [EolSection.Paragraphs]: cells.printParagraphs,
    [EolSection.OctalListing]: cells.printOctalListing,
    [EolSection.OctalCompact]: cells.printOctalListingCompact,
    [EolSection.Occupied]: cells.printOccupied,
    [EolSection.Results]: assembly.printResults
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
    const printer = new PrinterContext('001', program, user, '0000000-000', options.formatted)
    const charset = getCharset(isYul(options.yulVersion) ? CharSetType.HONEYWELL_800 : CharSetType.EBCDIC)
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

    function getProgram (mainUrl: string): string {
      const url = new URL(mainUrl)
      // Wait for ES2022, punt on weird URLs for now
      // const pathname = url.pathname.replaceAll(/\/+/g, '/')
      const pathname = url.pathname
      const programMatch = pathname.match(/.*\/([^/]+\/[^/]+)\.agc/)
      if (programMatch === null || programMatch[1] === null) {
        return pathname
      }
      return programMatch[1]
    }
  }
}
