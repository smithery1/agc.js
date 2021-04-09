import { compat } from '../common/compat'
import * as addressing from './addressing'
import { AssembledCard } from './assembly'
import { EolSection, Options } from './bootstrap'
import { Cells } from './cells'
import * as cusses from './cusses'
import { LexedLine, LineType } from './lexer'
import * as ops from './operations'
import * as parse from './parser'
import { Pass2Output } from './pass2'
import { compareSymbolsEbcdic, LINE_LENGTH, PrinterContext } from './printer-utils'
import { printTable, TableData } from './table-printer'
import { parity } from './util'

const COLUMNS = {
  LineNumber: 4,
  Context: 15,
  Address: 7,
  CellWord: 7,
  Location: 8,
  Instruction: 6,
  Operand: 24,
  Page: 4
}

const EMPTY_LINE_NUMBER = ' '.repeat(COLUMNS.LineNumber)
const EMPTY_CELL_WORD = ' '.repeat(COLUMNS.CellWord)

const COUNT_OP = ops.requireOperation('COUNT')
const ERASE_OP = ops.requireOperation('ERASE')

export function printCuss (instance: cusses.CussInstance): void {
  const formattedSerial = instance.cuss.serial.toString(16).toUpperCase().padStart(2, '0')
  compat.log(formattedSerial, instance.cuss.message)
  if (instance.error !== undefined) {
    compat.log('        ', instance.error.message)
  }
  if (instance.context !== undefined) {
    instance.context.forEach(item => {
      compat.log('        ', item)
    })
  }
}

export function printAssembly (printer: PrinterContext, pass2: Pass2Output, options: Options): void {
  let source = ''
  let page = 0
  let cussSource = ''
  const printListing = options.eol.has(EolSection.Listing)

  pass2.cards.forEach(card => {
    if (page !== card.lexedLine.sourceLine.page) {
      if (printListing) {
        printer.endPage(card.lexedLine.sourceLine.page)
      }
      source = card.lexedLine.sourceLine.source
      page = card.lexedLine.sourceLine.page
      if (printListing) {
        printHeader(printer, source, card.eBank, card.sBank)
      }
    }
    if (printListing) {
      printCard(printer, pass2, card)
    }
    printCusses(card)
  })

  if (printListing) {
    printer.endPage()
  }

  function printCusses (card: AssembledCard): void {
    if (card.cusses === undefined) {
      return
    }
    if (!printListing) {
      if (source !== cussSource) {
        compat.log(source)
        cussSource = source
      }
      printCard(printer, pass2, card)
    }
    card.cusses.cusses().forEach(instance => {
      const formattedSerial = instance.cuss.serial.toString(16).toUpperCase().padStart(2, '0')
      compat.log('E', '    ', formattedSerial, instance.cuss.message)
      if (instance.error !== undefined) {
        compat.log('E', '        ', instance.error.message)
      }
      if (instance.context !== undefined) {
        instance.context.forEach(item => {
          compat.log('E', '        ', item)
        })
      }
    })

    if (!printListing) {
      compat.output('')
    }
  }
}

function printCard (printer: PrinterContext, pass2: Pass2Output, card: AssembledCard): void {
  if (parse.isRemark(card.card)) {
    if (card.card.fullLine) {
      printFullLineRemark(printer, card.lexedLine)
    } else {
      printInstructionCard(printer, card, pass2.cells, 'A')
    }
  } else if (card.lexedLine.type !== LineType.Pagination) {
    printInstructionCard(printer, card, pass2.cells, ' ')
  }
}

function printHeader (printer: PrinterContext, source: string, eBank: number, sBank: number): void {
  const eBankString = 'E' + eBank.toString()
  const sBankString = sBank === 0 ? '' : 'S' + sBank.toString()
  const maxSourceLength = LINE_LENGTH - 2 - EMPTY_LINE_NUMBER.length - 7
  let sourceString = source
  if (sourceString.length >= maxSourceLength - 1) {
    const halfLength = Math.floor(maxSourceLength / 2) - 2
    sourceString = source.substring(0, halfLength) + '...' + source.substring(source.length - halfLength)
  }
  const bankSpacing = ' '.repeat(maxSourceLength - sourceString.length - 1)
  printer.println('L', EMPTY_LINE_NUMBER, sourceString, bankSpacing, eBankString, sBankString)
  printer.println('')
}

function printFullLineRemark (printer: PrinterContext, line: LexedLine): void {
  const lineNumber = lineNumberString(line)
  const remark = line.remark ?? ''
  printer.println('R', lineNumber, remark)
}

function lineNumberString (line: LexedLine | undefined): string {
  const lineNumber = line?.sourceLine.lineNumber.toString() ?? ''
  return lineNumber.padStart(COLUMNS.LineNumber)
}

function printLine (
  printer: PrinterContext,
  type: string,
  card: AssembledCard | null,
  address: string,
  word: string, parity: string,
  field1?: string, field2?: string, field3?: string, remark?: string): void {
  const lineNumber = lineNumberString(card?.lexedLine)
  const context = (card?.assemblerContext ?? '').padEnd(COLUMNS.Context)

  if (field1 === undefined) {
    printer.println(type, lineNumber, context, address, word, parity)
  } else {
    printer.println(type, lineNumber, context, address, word, parity, field1, field2, field3, remark)
  }
}

function printInstructionCard (printer: PrinterContext, card: AssembledCard, cells: Cells, type: string): void {
  const { field1, field2, field3, remark } = formatLine(card.lexedLine)
  if (card.refAddress === undefined) {
    const address = addressString(undefined)
    const word = wordString(card, undefined)
    printLine(printer, type, card, address, word, ' ', field1, field2, field3, remark)
  } else if (card.extent === 0) {
    const address = addressString(card.refAddress)
    const word = wordString(card, undefined)
    printLine(printer, type, card, address, word, ' ', field1, field2, field3, remark)
  } else if (parse.isClerical(card.card) && card.card.operation.operation === ERASE_OP) {
    printEraseCell(printer, card, card.refAddress, field1, field2, field3, remark)
  } else {
    printCell(printer, cells, card, card.refAddress, field1, field2, field3, remark)
    for (let i = 1; i < card.extent; i++) {
      printCell(printer, cells, null, card.refAddress + i)
    }
  }
}

function printEraseCell (
  printer: PrinterContext,
  card: AssembledCard,
  address: number,
  field1?: string, field2?: string, field3?: string, remark?: string): void {
  const octalAddress = addressString(address)
  const endAddress = addressString(address + card.extent - 1)
  printLine(printer, ' ', card, octalAddress, endAddress, ' ', field1, field2, field3, remark)
}

function printCell (
  printer: PrinterContext,
  cells: Cells,
  card: AssembledCard | null,
  address: number,
  field1?: string, field2?: string, field3?: string, remark?: string): void {
  const octalAddress = addressString(address)
  const word = cells.value(address)
  const octalWord = wordString(card, word)
  const parityBit = word === undefined ? ' ' : (parity(word) ? '1' : '0')
  printLine(printer, ' ', card, octalAddress, octalWord, parityBit, field1, field2, field3, remark)
}

function addressString (address?: number): string {
  return addressing.asAssemblyString(address).padStart(COLUMNS.Address)
}

function wordString (card: AssembledCard | null, word?: number): string {
  if (word === undefined) {
    return EMPTY_CELL_WORD
  }

  if (card !== null && parse.isBasic(card.card)) {
    if (card.card.operation.operation.qc === undefined) {
      const highDigit = (word & 0x7000) >> 12
      const lowDigits = word & 0xFFF

      return ' ' + highDigit.toString(8) + ' ' + lowDigits.toString(8).padStart(4, '0')
    } else {
      const highDigits = (word & 0x7E00) >> 9
      const lowDigits = word & 0xFF

      return ' ' + highDigits.toString(8).padStart(2, '0') + ' ' + lowDigits.toString(8).padStart(3, '0')
    }
  }

  return '  ' + word.toString(8).padStart(5, '0')
}

function formatLine (line: LexedLine): { field1: string, field2: string, field3: string, remark: string } {
  let field1: string
  let field2: string
  let field3: string
  let remark: string
  let field1Pad = false
  let field2Pad = false
  let field3Pad = false

  field1 = (line.field1 === undefined ? '' : line.field1)

  if (line.field2 === undefined) {
    field2 = ''
  } else {
    field1Pad = true
    field2 = line.field2.charAt(0) === '-' ? '' : ' '
    field2 += line.field2.padEnd(COLUMNS.Instruction)
  }

  if (line.field3 === undefined) {
    field3 = ''
  } else {
    field1Pad = field2Pad = true
    field3 = line.field3.replace(/\s+/g, ' ')
  }

  if (line.remark === undefined) {
    remark = ''
  } else {
    field1Pad = field2Pad = field3Pad = true
    remark = line.remark
  }

  if (field1Pad) {
    field1 = field1.padEnd(COLUMNS.Location, ' ')
  }
  if (field2Pad) {
    // Add 1 for leading compliment space
    field2 = field2.padEnd(COLUMNS.Instruction + 1, ' ')
  }
  if (field3Pad) {
    field3 = field3.padEnd(COLUMNS.Operand, ' ')
  }

  return { field1, field2, field3, remark }
}

interface CountContext {
  name: string
  refs: number
  lastPageStart: number
  lastPageEnd: number
  lastCount: number
  totalCount: number
  cumCount: number
}

function createCountContext (name: string): CountContext {
  return { name, refs: 0, lastPageStart: 0, lastPageEnd: 0, lastCount: 0, totalCount: 0, cumCount: 0 }
}

const COUNT_COLUMNS = {
  Name: 11,
  Refs: 3,
  LastStart: 4,
  LastEnd: 4,
  Counts: 5,
  Entry: 11 + 1 + 3 + 1 + 3 + 1 + 4 + 1 + 4 + 1 + 2 + 1 + 4 + 1 + 1 + 5 + 1 + 5 + 1 + 5
}

const COUNT_TABLE_DATA: TableData<CountContext> = {
  columns: 2,
  columnWidth: COUNT_COLUMNS.Entry,
  columnSeparator: 7,
  rowBreaks: 4,
  rowsPerPage: 50,
  tableHeader: 'ROUTINE: COUNT DATA FOR ROUTINE\'S LAST REACH:TOTAL:CUMUL',
  entryString: countEntryString,
  separator: () => false
}

function countEntryString (context: CountContext): string | undefined {
  const pageStartString = context.lastPageStart === 0 ? '' : context.lastPageStart.toString()
  return context.name.padEnd(COUNT_COLUMNS.Name)
    + ' REF ' + context.refs.toString().padStart(COUNT_COLUMNS.Refs)
    + ' LAST ' + pageStartString.toString().padStart(COUNT_COLUMNS.LastStart)
    + ' TO ' + context.lastPageEnd.toString().padStart(COUNT_COLUMNS.LastEnd) + ':'
    + ' ' + context.lastCount.toString().padStart(COUNT_COLUMNS.Counts)
    + ' ' + context.totalCount.toString().padStart(COUNT_COLUMNS.Counts)
    + ' ' + context.cumCount.toString().padStart(COUNT_COLUMNS.Counts)
}

export function printCounts (printer: PrinterContext, pass2: Pass2Output, options: Options): void {
  // Ref SYM, III-21
  const map = new Map<string, CountContext>()
  let currentCount: CountContext = createCountContext('')
  map.set(currentCount.name, currentCount)
  pass2.cards.forEach(card => {
    const page = card.lexedLine.sourceLine.page
    if (parse.isClerical(card.card) && card.card.operation.operation === COUNT_OP) {
      currentCount.lastPageEnd = page
      // Field required and verified in parser
      const symbol = parseSymbol(card.refAddress ?? 0, card.card, card.lexedLine.field3 ?? '')
      const lookup = map.get(symbol)
      if (lookup === undefined) {
        currentCount = createCountContext(symbol)
        map.set(symbol, currentCount)
      } else {
        currentCount = lookup
      }
      ++currentCount.refs
      currentCount.lastCount = 0
      currentCount.lastPageStart = page
      currentCount.lastPageEnd = page
    } else {
      if (card.extent > 0
        && card.refAddress !== undefined
        && addressing.isFixed(addressing.memoryArea(card.refAddress))) {
        currentCount.lastCount += card.extent
        currentCount.totalCount += card.extent
        currentCount.cumCount += card.extent
      }
      currentCount.lastPageEnd = page
    }
  })

  const sortedTable = [...map.values()].sort(ebcdicSort)
  let cumCount = 0
  sortedTable.forEach(count => {
    cumCount += count.totalCount
    count.cumCount = cumCount
  })
  printTable(printer, COUNT_TABLE_DATA, sortedTable.values(), options)
  printer.endPage()

  function parseSymbol (address: number, card: parse.ClericalCard, field: string): string {
    if (card.operation.indexed) {
      const bank = addressing.fixedBankNumber(address)
      const bankString = bank === undefined ? '??' : bank.toString(8).padStart(2, '0')
      return field.replace('$$', bankString)
    }
    return field
  }

  function ebcdicSort (e1: CountContext, e2: CountContext): number {
    return compareSymbolsEbcdic(e1.name, e2.name)
  }
}
