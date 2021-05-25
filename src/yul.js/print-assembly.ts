import { compat } from '../common/compat'
import { AddressField } from './address-field'
import { AssembledCard } from './assembly'
import { Cells } from './cells'
import { LexedLine, LineType } from './lexer'
import { Memory } from './memory'
import { InterpretiveType } from './operations'
import { AssemblerEnum } from './options'
import * as parse from './parser'
import { Pass2Output } from './pass2'
import { LINE_LENGTH, PrintContext } from './printer'
import { printTable, TableData } from './table-printer'
import { parity } from './util'

const COLUMNS = {
  LineNumber: 4,
  Context: 21,
  Address: 7,
  CellWord: 7,
  Location: 8,
  Instruction: 6,
  Operand: 14,
  Page: 4
}

const EMPTY_LINE_NUMBER = ' '.repeat(COLUMNS.LineNumber)
const EMPTY_CELL_WORD = ' '.repeat(COLUMNS.CellWord)

export function printCusses (pass2: Pass2Output, context: PrintContext): void {
  printAssembly(pass2, context, false, true)
}

export function printListing (pass2: Pass2Output, context: PrintContext): void {
  printAssembly(pass2, context, true, false)
}

export function printListingWithCusses (pass2: Pass2Output, context: PrintContext): void {
  printAssembly(pass2, context, true, true)
}

function printAssembly (pass2: Pass2Output, context: PrintContext, listing: boolean, cusses: boolean): void {
  let source = ''
  let page = 0
  let cussSource = ''
  interface Reference {
    count: number
    last: number
  }
  const refMap = new Map<string, Reference>()
  const operations = context.operations
  const memory = context.memory
  const printer = context.printer

  pass2.cards.forEach(card => {
    if (page !== card.lexedLine.sourceLine.page) {
      if (listing) {
        context.printer.endPage(card.lexedLine.sourceLine.page)
      }
      source = card.lexedLine.sourceLine.source
      page = card.lexedLine.sourceLine.page
      if (listing) {
        printHeader(source, card.eBank, card.sBank)
      }
    }
    if (listing) {
      printCard(card)
    }
    if (cusses) {
      printCusses(card)
    }
  })

  function printCusses (card: AssembledCard): void {
    if (card.cusses === undefined) {
      return
    }
    if (!listing) {
      if (source !== cussSource) {
        compat.log(source)
        cussSource = source
      }
      printCard(card)
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

    if (!listing) {
      compat.output('')
    }
  }

  function printCard (card: AssembledCard): void {
    if (parse.isRemark(card.card)) {
      if (card.card.fullLine) {
        printFullLineRemark(card.lexedLine)
      } else {
        printInstructionCard(card, pass2.cells, 'A')
      }
    } else if (card.lexedLine.type !== LineType.Pagination) {
      printInstructionCard(card, pass2.cells, ' ')
    }
  }

  function printHeader (source: string, eBank: number, sBank: number): void {
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
    printer.printLeadingSeparator()
  }

  function printFullLineRemark (line: LexedLine): void {
    const lineNumber = lineNumberString(line)
    const remark = line.remark ?? ''
    printer.println('R', lineNumber, remark)
  }

  function lineNumberString (line: LexedLine | undefined): string {
    const lineNumber = line?.sourceLine.lineNumber.toString() ?? ''
    return lineNumber.padStart(COLUMNS.LineNumber)
  }

  function printLine (
    type: string,
    card: AssembledCard | null,
    address: string,
    word: string, parity: string,
    field1?: string, field2?: string, field3?: string, remark?: string): void {
    const lineNumber = lineNumberString(card?.lexedLine)
    const context = (' ' + getContext(card)).padEnd(COLUMNS.Context)

    if (field1 === undefined) {
      printer.println(type, lineNumber, context, address, word, parity)
    } else {
      printer.println(type, lineNumber, context, address, word, parity, field1, field2, field3, remark)
    }

    function getContext (card: AssembledCard | null): string {
      if (card === null) {
        return ''
      }
      if (card.assemblerContext !== undefined) {
        return card.assemblerContext
      }

      let address: AddressField | undefined
      if (parse.hasAddressField(card.card)) {
        address = card.card.address
      } else if (parse.isInterpretive(card.card) && card.card.lhs?.operation.subType === InterpretiveType.Store) {
        address = (card.card.rhs as AddressField)
      }

      let symbol = (typeof address?.value === 'string') ? address.value : undefined
      if (symbol === undefined) {
        return ''
      }

      if (parse.isClerical(card.card) && card.card.operation.operation === operations.operation('COUNT')) {
        symbol = expandCountSymbol(memory, card.refAddress ?? 0, card.card, symbol)
      }

      let ref = refMap.get(symbol)
      if (ref === undefined) {
        ref = { count: 1, last: 0 }
        refMap.set(symbol, ref)
      } else {
        ++ref.count
      }

      let context = 'REF ' + ref.count.toString().padStart(3)
      if (ref.count > 1) {
        context += '  LAST ' + ref.last.toString().padStart(4)
      }
      ref.last = card.lexedLine.sourceLine.page
      return context
    }
  }

  function printInstructionCard (card: AssembledCard, cells: Cells, type: string): void {
    const { field1, field2, field3, remark } = formatLine(card.lexedLine)
    if (card.refAddress === undefined) {
      const address = addressString(undefined)
      const word = wordString(card, undefined)
      printLine(type, card, address, word, ' ', field1, field2, field3, remark)
    } else if (card.extent === 0) {
      const address = addressString(card.refAddress)
      const word = wordString(card, undefined)
      printLine(type, card, address, word, ' ', field1, field2, field3, remark)
    } else if (parse.isClerical(card.card) && card.card.operation.operation === operations.operation('ERASE')) {
      printEraseCell(card, card.refAddress, field1, field2, field3, remark)
    } else {
      printCell(cells, card, card.refAddress, field1, field2, field3, remark)
      for (let i = 1; i < card.extent; i++) {
        printCell(cells, null, card.refAddress + i)
      }
    }
  }

  function printEraseCell (
    card: AssembledCard,
    address: number,
    field1?: string, field2?: string, field3?: string, remark?: string): void {
    const octalAddress = addressString(address)
    const endAddress = addressString(address + card.extent - 1)
    printLine(' ', card, octalAddress, endAddress, ' ', field1, field2, field3, remark)
  }

  function printCell (
    cells: Cells,
    card: AssembledCard | null,
    address: number,
    field1?: string, field2?: string, field3?: string, remark?: string): void {
    const octalAddress = addressString(address)
    const word = cells.value(address)
    const octalWord = wordString(card, word)
    const parityBit = word === undefined ? ' ' : (parity(word) ? '1' : '0')
    printLine(' ', card, octalAddress, octalWord, parityBit, field1, field2, field3, remark)
  }

  function addressString (address?: number): string {
    return context.memory.asAssemblyString(address).padStart(COLUMNS.Address)
  }

  function wordString (card: AssembledCard | null, word?: number): string {
    if (word === undefined) {
      return EMPTY_CELL_WORD
    }

    if (card !== null && parse.isBasic(card.card)) {
      if (card.card.operation.operation.qc === undefined) {
        const highDigit = word >> 12
        const lowDigits = word & 0xFFF
        return ' ' + highDigit.toString(8) + ' ' + lowDigits.toString(8).padStart(4, '0')
      } else {
        const highDigits = word >> 9
        const lowDigits = word & 0x1FF
        const qcOn = (highDigits & 1) === 1
        const tick = qcOn ? "'" : ' '
        return ' ' + highDigits.toString(8).padStart(2, '0') + tick + lowDigits.toString(8).padStart(3, '0')
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
      // Add 1 for leading complement space
      field2 = field2.padEnd(COLUMNS.Instruction + 1, ' ')
    }
    if (field3Pad) {
      field3 = field3.padEnd(COLUMNS.Operand, ' ')
    }

    return { field1, field2, field3, remark }
  }
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
  columnGap: 7,
  rowBreaks: 4,
  rowsPerPage: 50,
  tableHeader: 'ROUTINE: COUNT DATA FOR ROUTINE\'S LAST REACH:TOTAL:CUMUL',
  entryString: countEntryString
}

function countEntryString (print: PrintContext, context: CountContext): string | undefined {
  const pageStartString = context.lastPageStart === 0 ? '' : context.lastPageStart.toString()
  return context.name.padEnd(COUNT_COLUMNS.Name)
    + ' REF ' + context.refs.toString().padStart(COUNT_COLUMNS.Refs)
    + ' LAST ' + pageStartString.toString().padStart(COUNT_COLUMNS.LastStart)
    + ' TO ' + context.lastPageEnd.toString().padStart(COUNT_COLUMNS.LastEnd) + ':'
    + ' ' + context.lastCount.toString().padStart(COUNT_COLUMNS.Counts)
    + ' ' + context.totalCount.toString().padStart(COUNT_COLUMNS.Counts)
    + ' ' + context.cumCount.toString().padStart(COUNT_COLUMNS.Counts)
}

export function printCounts (pass2: Pass2Output, context: PrintContext): void {
  // Ref SYM, III-21
  const map = new Map<string, CountContext>()
  let currentCount: CountContext = createCountContext('')
  map.set(currentCount.name, currentCount)
  pass2.cards.forEach(card => {
    const page = card.lexedLine.sourceLine.page
    if (parse.isClerical(card.card) && card.card.operation.operation === context.operations.operation('COUNT')) {
      currentCount.lastPageEnd = page
      // Field required and verified in parser
      const symbol = expandCountSymbol(context.memory, card.refAddress ?? 0, card.card, card.lexedLine.field3 ?? '')
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
        && context.memory.isFixed(context.memory.memoryType(card.refAddress))) {
        currentCount.lastCount += card.extent
        currentCount.totalCount += card.extent
        currentCount.cumCount += card.extent
      } else if (parse.isClerical(card.card)
        && card.card.operation.operation === context.operations.operation('=ECADR')) {
        // Don't understand the =ECADR instruction yet, which is apparently a late addition to GAP.
        // This is empirically correct per Luminary210 count data table, but we don't allocate any fixed memory for it
        // and we still match on assembled binary data.
        ++currentCount.lastCount
        ++currentCount.totalCount
        ++currentCount.cumCount
      }
      currentCount.lastPageEnd = page
    }
  })

  const sortedTable = [...map.values()].sort(
    (e1: CountContext, e2: CountContext) => context.charset.compare(e1.name, e2.name))
  let cumCount = 0
  sortedTable.forEach(count => {
    cumCount += count.totalCount
    count.cumCount = cumCount
  })
  printTable(context, COUNT_TABLE_DATA, sortedTable.values())
}

function expandCountSymbol (memory: Memory, address: number, card: parse.ClericalCard, field: string): string {
  if (card.operation.indexed) {
    const bank = memory.fixedBankNumber(address)
    const bankString = bank === undefined ? '??' : bank.toString(8).padStart(2, '0')
    return field.replace('$$', bankString)
  }
  return field
}

const NO_CUSSES = ['GOOD', 'SUPERB']
const NON_FATAL = ['FAIR', 'SO-SO']
const FATAL_1 = ['BAD', 'DISMAL']
const FATAL_2 = ['LOUSY', 'AWFUL']
const FATAL_3 = ['ROTTEN', 'VILE']
const FATAL_4 = ['BILIOUS', 'PUTRID']
const FATAL_MAX = 'YUCCCHHHH'

// Not quite exact, but in the spirit of Ref https://www.ibiblio.org/apollo/YUL/01%20-%20Intro/yul-0013.jpg
export function printResults (pass2: Pass2Output, context: PrintContext): void {
  let result: string
  let manufacturable = ''

  if (context.options.assembler.isLaterThan(AssemblerEnum.Y1965)) {
    context.printer.endPage()
  } else if (context.options.formatted) {
    context.printer.printTrailingSeparator()
  }

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
