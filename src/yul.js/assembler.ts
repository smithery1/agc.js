import { compat } from '../common/compat'
import { isCussInstance } from './cusses'
import { Pass1Assembler } from './pass1'
import { Pass2Assembler, Pass2Output } from './pass2'
import { printAssembly, printCounts, printCuss } from './print-assembly'
import { printMemorySummary, printOccupied, printOctalListing, printParagraphs } from './print-cells'
import { printSymbolTable } from './print-symbol-table'
import { PrinterContext } from './printer-utils'

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
  private readonly pass1: Pass1Assembler
  private readonly pass2: Pass2Assembler

  constructor () {
    this.pass1 = new Pass1Assembler()
    this.pass2 = new Pass2Assembler()
  }

  /**
   * Runs the assembler on the specified URL, which typically points to a MAIN.agc yaYUL formatted file.
   *
   * @param mainUrl the URL of the starting file
   * @returns true iff assembly succeeded without errors
   */
  async assemble (mainUrl: string): Promise<boolean> {
    try {
      const pass1Result = await this.pass1.assemble(mainUrl)
      if (isCussInstance(pass1Result)) {
        printCuss(pass1Result)
        return false
      }
      const pass2Result = this.pass2.assemble(pass1Result)
      this.printListing(pass2Result)
      return pass2Result.fatalCussCount === 0
    } catch (error) {
      compat.log(error.stack)
      return false
    }
  }

  private printListing (pass2: Pass2Output): void {
    const user = compat.username()
    const printer = new PrinterContext('001', 'LMY99', user)

    printer.printHeader()
    printAssembly(printer, pass2)
    printer.printPageBreak()
    printSymbolTable(printer, pass2.symbolTable)
    printer.printPageBreak()
    printMemorySummary(printer, pass2.cells)
    printer.printPageBreak()
    printCounts(printer, pass2)
    printer.printPageBreak()
    printParagraphs(printer, pass2.cells)
    printer.printPageBreak()
    printOctalListing(printer, pass2.cells)
    printer.printPageBreak()
    printOccupied(printer, pass2.cells)
    printer.printPageBreak()
    this.printResults(printer, pass2)
  }

  // Not quite exact, but in the spirit of Ref https://www.ibiblio.org/apollo/YUL/01%20-%20Intro/yul-0013.jpg
  private printResults (printer: PrinterContext, pass2: Pass2Output): void {
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
    printer.println(`ASSEMBLY WAS ${result}${manufacturable}. ${cussed} LINES WERE CUSSED.`)

    function inSet (digit: string): boolean {
      return digit === '2' || digit === '3' || digit === '6' || digit === '7'
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
