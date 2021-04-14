import * as addressing from './addressing'
import { Mode } from './bootstrap'
import { Cell } from './cells'
import * as ops from './operations'
import * as parse from './parser'
import { Pass2Output } from './pass2'
import { PrintContext } from './printer-utils'
import { printTable, TableData } from './table-printer'
import { parity } from './util'

const BNKSUM_OP = ops.requireOperation('BNKSUM')
const P_OP = ops.requireOperation('P')

const MEM_SPECIAL = 'SPECIAL OR NONEXISTENT MEMORY'
const MEM_AVAIL = 'AVAILABLE'
const MEM_RESERVED = 'RESERVED'
const MEM_SWITCHABLE = 'SWITCHABLE'
const MEM_ERASABLE = 'ERASABLE MEMORY'
const MEM_FIXED = 'FIXED MEMORY'

const MEMORY_SUMMARY_GAP_TABLE_DATA: TableData<string[]> = {
  columns: 2,
  columnWidth: 60,
  columnGap: 4,
  rowsPerPage: 45,
  reflowLastPage: false,
  pageHeader: ['MEMORY TYPE & AVAILABILITY DISPLAY'],
  entryString: (entry: string[]) => entry.join(' ').padEnd(60),
  separator: () => false
}

const MEMORY_SUMMARY_YUL_TABLE_DATA: TableData<string[]> = {
  columns: 2,
  columnWidth: 60,
  columnGap: 4,
  rowsPerPage: 50,
  reflowLastPage: false,
  pageHeader: ['MEMORY TYPE & AVAILABILITY DISPLAY'],
  entryString: (entry: string[]) => entry.join(' ').padEnd(60),
  separator: () => false
}

export function printMemorySummary (pass2: Pass2Output, context: PrintContext): void {
  const cells = pass2.cells.getCells()
  const def = context.options.mode === Mode.Yul ? MEMORY_SUMMARY_YUL_TABLE_DATA : MEMORY_SUMMARY_GAP_TABLE_DATA
  let rowCount = 1

  printTable(context.printer, def, entries(), context.options)

  function * entries (): Generator<string[]> {
    yield handle(addressing.TRUE_RANGE_HARDWARE.min, addressing.TRUE_RANGE_SPECIAL.max, MEM_SPECIAL)
    yield * checkGap()
    yield * handleRange(addressing.TRUE_RANGE_UNSWITCHED_ERASABLE, false, MEM_ERASABLE)
    yield * checkGap()
    yield * handleRange(addressing.TRUE_RANGE_SWITCHED_ERASABLE, true, MEM_ERASABLE)
    yield * checkGap()
    yield * handleRange(addressing.TRUE_RANGE_FIXED_FIXED, false, MEM_FIXED)
    yield * checkGap()
    yield * handleRange(addressing.TRUE_RANGE_VARIABLE_FIXED_1, true, MEM_FIXED)
    yield * checkGap()
    // Perhaps have addressing able to express this range along with other high ranges referenced on the actual GAP
    // version of this page?
    // They're not used anywhere else however.
    yield * checkRowCount()
    yield ['02,2000', ' TO ', '03,3777', '  ', MEM_SPECIAL]
    yield * checkGap()
    yield * handleRange(addressing.TRUE_RANGE_VARIABLE_FIXED_2, true, MEM_FIXED)
    context.printer.endPage()

    function * handleRange (range: addressing.Range, isSwitchable: boolean, desc: string): Generator<string[]> {
      const minOffset = addressing.memoryOffset(range.min)
      const maxOffset = addressing.memoryOffset(range.max)
      const fullDesc = isSwitchable && context.options.mode === Mode.Gap ? MEM_SWITCHABLE + ' ' + desc : desc
      let type = cells[minOffset] === undefined ? MEM_AVAIL : MEM_RESERVED
      let rangeStart = minOffset

      for (let i = minOffset + 1; i <= maxOffset; i++) {
        if (cells[i] === undefined) {
          if (type === MEM_RESERVED) {
            yield * checkRowCount()
            yield handle(addressing.memoryAddress(rangeStart), addressing.memoryAddress(i - 1), type, fullDesc)
            type = MEM_AVAIL
            rangeStart = i
          }
        } else if (type === MEM_AVAIL) {
          yield * checkRowCount()
          yield handle(addressing.memoryAddress(rangeStart), addressing.memoryAddress(i - 1), type, fullDesc)
          type = MEM_RESERVED
          rangeStart = i
        }
      }

      yield * checkRowCount()
      yield handle(addressing.memoryAddress(rangeStart), addressing.memoryAddress(maxOffset), type, fullDesc)
    }

    function * checkRowCount (): Generator<string[]> {
      if (rowCount === 4) {
        rowCount = 1
        if (context.options.mode === Mode.Yul) {
          yield ['']
        }
      } else {
        ++rowCount
      }
    }

    function * checkGap (): Generator<string[]> {
      if (context.options.mode === Mode.Gap) {
        yield ['']
      }
    }

    function handle (min: number, max: number, type: string, desc?: string): string[] {
      const endString = addressing.asAssemblyString(max).padStart(7)
      const startString = (min === max ? '' : addressing.asAssemblyString(min)).padStart(7)
      const completeDesc = type + (desc === undefined ? '' : ' ' + desc)
      return [startString, ' TO ', endString, '  ', completeDesc]
    }
  }
}

function isParagraphEmpty (start: number, cells: Cell[]): boolean {
  for (let i = start; i < start + 256; i++) {
    if (cells[i]?.value !== undefined) {
      return false
    }
  }
  return true
}

const PARAGRAPHS_HEADER = 'PARAGRAPHS GENERATED FOR THIS ASSEMBLY; ADDRESS LIMITS AND THE MANUFACTURING LOCATION CODE ARE SHOWN FOR EACH'

export function printParagraphs (pass2: Pass2Output, context: PrintContext): void {
  const cells = pass2.cells.getCells()
  const rowsPerPage = context.options.mode === Mode.Yul ? 50 : 45

  const header = PARAGRAPHS_HEADER + (context.options.mode === Mode.Yul ? '.' : '')
  let row = 0
  let separator = 0

  // Ref SYM, IIF
  for (let i = addressing.FIXED_MEMORY_OFFSET; i < cells.length; i += 256) {
    if (isParagraphEmpty(i, cells)) {
      ++separator
      continue
    }
    if (context.options.mode === Mode.Yul && ++separator === 5) {
      context.printer.println('')
      ++row
      separator = 1
    }
    if (row >= rowsPerPage) {
      context.printer.endPage()
      if (context.options.tableText && (context.options.formatted || row === 0)) {
        context.printer.println(header)
        context.printer.println('')
      }
      row = 0
    }
    ++row

    const address = addressing.memoryAddress(i)
    const paragraph = addressing.paragraph(address)
    const bankAndAddress = addressing.asBankAndAddress(address)
    const bank = addressing.fixedBankNumber(address)

    if (context.options.mode === Mode.Gap && address === 0x2000) {
      context.printer.println('')
      // First page has 1 fewer line than other pages, so skip an extra here.
      row += 2
    }

    if (paragraph !== undefined && bankAndAddress !== undefined && bank !== undefined) {
      const sRegister = bankAndAddress.address
      const minString = addressing.asAssemblyString(address).padStart(7)
      const maxString = addressing.asAssemblyString(address + 255).padStart(7)
      const paragraphString = paragraph.toString(8).padStart(3, '0')
      const module = addressing.hardwareModule(bank)
      const side = addressing.hardwareSide(sRegister)
      const set = addressing.hardwareStrand(bank, sRegister)
      const wires = addressing.hardwareWires(set)

      context.printer.println(
        minString, 'TO', maxString,
        'PARAGRAPH #', paragraphString,
        '         ROPE MODULE ', module,
        ', SIDE ', side,
        ', SENSE LINE SET ', set.toString().padStart(2),
        '(WIRES ' + wires.min.toString().padStart(3) + '-' + wires.max.toString().padStart(3) + ')'
      )
    }
  }

  context.printer.endPage()
}

const OCTAL_LISTING_COLUMNS = {
  Paragraph: 3,
  Address: 7,
  Type: 5,
  Value: 5,
  Parity: 1
}

export function printOctalListing (pass2: Pass2Output, context: PrintContext): void {
  const cells = pass2.cells.getCells()
  const ofFor = context.options.mode === Mode.Yul ? 'OF' : 'FOR'
  const punct = context.options.mode === Mode.Yul ? ';' : ','
  const period = context.options.mode === Mode.Yul ? '.' : ''

  for (let i = addressing.FIXED_MEMORY_OFFSET; i < cells.length; i += 256) {
    printParagraph(i, cells)
  }

  context.printer.endPage()

  function printParagraph (startIndex: number, cells: Cell[]): void {
    const paragraph = addressing.paragraph(addressing.memoryAddress(startIndex))
    if (paragraph === undefined || isParagraphEmpty(startIndex, cells)) {
      return
    }

    context.printer.endPage()
    if (context.options.formatted && context.options.tableText) {
      context.printer.println(
        `OCTAL LISTING ${ofFor} PARAGRAPH #`,
        paragraph.toString(8).padStart(OCTAL_LISTING_COLUMNS.Paragraph, '0') + ',',
        ` WITH PARITY BIT IN BINARY AT THE RIGHT OF EACH WORD${punct} "@" DENOTES UNUSED FIXED MEMORY`)
      context.printer.println('')
      context.printer.println(
        'ALL VALID WORDS ARE BASIC INSTRUCTIONS EXCEPT THOSE MARKED "I" (INTERPRETIVE OPERATOR WORDS) OR "C" (CONSTANTS)' + period)
    }

    for (let i = startIndex; i < startIndex + 256; i += 8) {
      printLine(i, cells)
    }
  }

  function printLine (startIndex: number, cells: Cell[]): void {
    interface PrintEntry {
      type: string
      value: string
      parity: string
    }

    const address = addressing.memoryAddress(startIndex)
    const addressString = addressing.asAssemblyString(address).padStart(OCTAL_LISTING_COLUMNS.Address, ' ')

    if (startIndex % 32 === 0) {
      context.printer.println('')
    }

    const entries: PrintEntry[] = []
    for (let i = startIndex; i < startIndex + 8; i++) {
      const result = entry(cells[i])
      result.type = result.type.padStart(OCTAL_LISTING_COLUMNS.Type, ' ')
      result.value = result.value.padStart(OCTAL_LISTING_COLUMNS.Value, '0')
      result.parity = result.parity.padStart(OCTAL_LISTING_COLUMNS.Parity, ' ')
      entries.push(result)
    }

    context.printer.println(
      addressString,
      entries[0].type, entries[0].value, entries[0].parity,
      entries[1].type, entries[1].value, entries[1].parity,
      entries[2].type, entries[2].value, entries[2].parity,
      entries[3].type, entries[3].value, entries[3].parity,
      entries[4].type, entries[4].value, entries[4].parity,
      entries[5].type, entries[5].value, entries[5].parity,
      entries[6].type, entries[6].value, entries[6].parity,
      entries[7].type, entries[7].value, entries[7].parity
    )

    function entry (cell: Cell | undefined): PrintEntry {
      if (cell?.value === undefined) {
        return { type: '', value: '  @'.padEnd(OCTAL_LISTING_COLUMNS.Value, ' '), parity: '' }
      }

      let type = ''
      const card = cell.definition.card
      if (parse.isAddressConstant(card)) {
        if (card.operation.operation === P_OP) {
          type = 'I:'
        } else {
          type = 'C:'
        }
      } else if (parse.isNumericConstant(card)) {
        type = 'C:'
      } else if (parse.isClerical(card)) {
        if (card.operation.operation === BNKSUM_OP) {
          type = 'CKSUM'
        } else {
          type = 'C:'
        }
      }
      const parityString = parity(cell.value) ? '1' : '0'
      return { type, value: cell.value.toString(8), parity: parityString }
    }
  }
}

export function printOctalListingCompact (pass2: Pass2Output, context: PrintContext): void {
  const cells = pass2.cells.getCells()

  if (context.options.tableColumnHeaders) {
    context.printer.println('OCTAL COMPACT LISTING - ADDRESS 0 1 2 3 4 5 6 7')
  }

  const s4StartIndex = addressing.memoryOffset(addressing.TRUE_RANGE_SUPERBANK_S4.min)
  const s4EndIndex = addressing.memoryOffset(addressing.TRUE_RANGE_SUPERBANK_S4.max + 1)
  let s4Empty = true
  for (let p = s4StartIndex; p < s4EndIndex; p += 256) {
    if (!isParagraphEmpty(p, cells)) {
      s4Empty = false
      break
    }
  }

  for (let i = addressing.FIXED_MEMORY_OFFSET; i < cells.length; i += 256) {
    printParagraph(i, cells)
  }

  context.printer.endPage()

  function printParagraph (startIndex: number, cells: Cell[]): void {
    if (s4Empty && startIndex >= s4StartIndex) {
      return
    }

    for (let i = startIndex; i < startIndex + 256; i += 8) {
      printLine(i, cells)
    }
  }

  function printLine (startIndex: number, cells: Cell[]): void {
    const address = addressing.memoryAddress(startIndex)
    const addressString = addressing
      .asAssemblyString(address)
      .padStart(OCTAL_LISTING_COLUMNS.Address, ' ')

    const entries: string[] = []
    entries.push(addressString)
    for (let i = startIndex; i < startIndex + 8; i++) {
      const value = cells[i]?.value
      if (value === undefined) {
        entries.push('  @'.padEnd(OCTAL_LISTING_COLUMNS.Value))
      } else {
        entries.push(value.toString(8).padStart(OCTAL_LISTING_COLUMNS.Value, '0'))
      }
    }

    context.printer.println(...entries)
  }
}

interface OccupiedContext {
  cells: Cell[]
  startIndex: number
  page: number
  lineCount: number
}

const OCCUPIED_COLUMNS = {
  Start: 7,
  ToL: 2,
  End: 7,
  Page: 4,
  Entry: 7 + 1 + 2 + 1 + 7 + 1 + 4
}

const OCCUPIED_TABLE_DATA: TableData<[number, OccupiedContext]> = {
  columns: 4,
  columnWidth: OCCUPIED_COLUMNS.Entry,
  columnGap: 7,
  rowsPerPage: 50,
  rowBreaks: 4,
  tableHeader: 'OCCUPIED LOCATIONS' + '  ' + 'PAGE'.padEnd(OCCUPIED_COLUMNS.Page),
  entryString: occupiedEntryString,
  separator: () => false
}

function occupiedEntryString (data: [number, OccupiedContext]): string | undefined {
  const index = data[0]
  const context = data[1]
  const cell = context.cells[index]
  const page = cell === undefined ? 0 : cell.definition.lexedLine.sourceLine.page

  if (page !== context.page) {
    const oldPage = context.page
    const startIndex = context.startIndex
    context.page = page
    context.startIndex = index

    if (oldPage > 0) {
      const endAddress = addressing.memoryAddress(index - 1)
      const endString = addressing.asAssemblyString(endAddress).padStart(OCCUPIED_COLUMNS.End, ' ')
      if (startIndex === index - 1) {
        return ' '.padStart(OCCUPIED_COLUMNS.Start)
          + ' TO '
          + ' ' + endString.padStart(OCCUPIED_COLUMNS.End)
          + ' ' + oldPage.toString().padStart(OCCUPIED_COLUMNS.Page)
      } else {
        const startAddress = addressing.memoryAddress(startIndex)
        const startString = addressing.asAssemblyString(startAddress).padStart(OCCUPIED_COLUMNS.Start, ' ')

        return startString.padStart(OCCUPIED_COLUMNS.Start)
          + ' TO '
          + ' ' + endString.padStart(OCCUPIED_COLUMNS.End)
          + ' ' + oldPage.toString().padStart(OCCUPIED_COLUMNS.Page)
      }
    }
  }

  return undefined
}

export function printOccupied (pass2: Pass2Output, context: PrintContext): void {
  const cells = pass2.cells.getCells()
  const occupiedContext: OccupiedContext = {
    cells,
    startIndex: 0,
    page: 0,
    lineCount: 0
  }

  printTable(context.printer, OCCUPIED_TABLE_DATA, entries(), context.options)
  context.printer.endPage()

  function * entries (): Generator<[number, OccupiedContext]> {
    const start = addressing.memoryOffset(addressing.FIXED_MEMORY_OFFSET)
    for (let i = start; i < cells.length; i++) {
      yield [i, occupiedContext]
    }
  }
}
