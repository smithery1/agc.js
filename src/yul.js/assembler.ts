import { compat } from '../common/compat'
import { EolSection, isStderrSection, isYul, Options } from './bootstrap'
import { CharSetType, getCharset } from './charset'
import { isCussInstance } from './cusses'
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
    [EolSection.Results]: printResults
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
      const pass1 = new Pass1Assembler(operations, options)
      const pass2 = new Pass2Assembler(operations, options)
      const pass1Result = await pass1.assemble(options.file)
      if (isCussInstance(pass1Result)) {
        printCuss(pass1Result)
        return false
      }
      const pass2Result = pass2.assemble(pass1Result)
      this.printOutput(operations, options, pass2Result)
      return pass2Result.fatalCussCount === 0
    } catch (error) {
      compat.log(error.stack)
      return false
    }
  }

  private printOutput (operations: Operations, options: Options, pass2: Pass2Output): void {
    const program = getProgram(options.file)
    const user = compat.username()
    const printer = new PrinterContext('001', program, user, '0000000-000', options.formatted)
    const charset = getCharset(isYul(options.yulVersion) ? CharSetType.HONEYWELL_800 : CharSetType.EBCDIC)
    const context: PrintContext = {
      options,
      operations,
      printer,
      charset
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

const NO_CUSSES = ['GOOD', 'SUPERB']
const NON_FATAL = ['FAIR', 'SO-SO']
const FATAL_1 = ['BAD', 'DISMAL']
const FATAL_2 = ['LOUSY', 'AWFUL']
const FATAL_3 = ['ROTTEN', 'VILE']
const FATAL_4 = ['BILIOUS', 'PUTRID']
const FATAL_MAX = 'YUCCCHHHH'

// Not quite exact, but in the spirit of Ref https://www.ibiblio.org/apollo/YUL/01%20-%20Intro/yul-0013.jpg
function printResults (pass2: Pass2Output, context: PrintContext): void {
  let result: string
  let manufacturable = ''

  if (pass2.fatalCussCount > 999) {
    result = FATAL_MAX
  } else {
    const symbolTableSize = pass2.symbolTable.getTable().size.toString(8)
    const symbolTableUnits = symbolTableSize.charAt(symbolTableSize.length - 1)
    const lastCodePage = pass2.cards[pass2.cards.length - 1].lexedLine.sourceLine.page.toString()
    const lastCodePageUnits = lastCodePage.charAt(lastCodePage.length - 1)
    let list: number
    if ((inSet(symbolTableUnits) && !inSet(lastCodePageUnits))
      || (!inSet(symbolTableUnits) && inSet(lastCodePageUnits))) {
      list = 0
    } else {
      list = 1
    }

    let quality: string[]
    if (pass2.fatalCussCount === 0 && pass2.nonFatalCussCount === 0) {
      quality = NO_CUSSES
      manufacturable = ' AND MANUFACTURABLE'
    } else if (pass2.fatalCussCount === 0) {
      quality = NON_FATAL
      manufacturable = ' AND MANUFACTURABLE'
    } else if (pass2.fatalCussCount <= 2) {
      quality = FATAL_1
    } else if (pass2.fatalCussCount <= 9) {
      quality = FATAL_2
    } else if (pass2.fatalCussCount <= 99) {
      quality = FATAL_3
    } else {
      quality = FATAL_4
    }

    result = quality[list]
  }

  const totalCusses = pass2.fatalCussCount + pass2.nonFatalCussCount
  const cussed = totalCusses === 0 ? 'NO ' : totalCusses.toString()
  context.printer.println(`ASSEMBLY WAS ${result}${manufacturable}. ${cussed} LINES WERE CUSSED.`)
  context.printer.endPage()

  function inSet (digit: string): boolean {
    return digit === '2' || digit === '3' || digit === '6' || digit === '7'
  }
}
