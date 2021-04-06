import * as addressing from './addressing'
import { Cell, Cells } from './cells'
import * as ops from './operations'
import * as parse from './parser'
import { PrinterContext } from './printer-utils'
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

const MEMORY_SUMMARY_TABLE_DATA: TableData<string[]> = {
  columns: 2,
  columnWidth: 60,
  columnSeparator: 4,
  rowsPerPage: 45,
  reflowLastPage: false,
  pageHeader: ['MEMORY TYPE & AVAILABILITY DISPLAY'],
  entryString: (entry: string[]) => entry.join(' ').padEnd(60),
  separator: () => false
}

export function printMemorySummary (printer: PrinterContext, container: Cells): void {
  const cells = container.getCells()

  printTable(printer, MEMORY_SUMMARY_TABLE_DATA, entries())

  function * entries (): Generator<string[]> {
    yield handle(addressing.TRUE_RANGE_HARDWARE.min, addressing.TRUE_RANGE_SPECIAL.max, MEM_SPECIAL)
    yield ['']
    yield * handleRange(addressing.TRUE_RANGE_UNSWITCHED_ERASABLE, MEM_ERASABLE)
    yield ['']
    yield * handleRange(addressing.TRUE_RANGE_SWITCHED_ERASABLE, MEM_SWITCHABLE + ' ' + MEM_ERASABLE)
    yield ['']
    yield * handleRange(addressing.TRUE_RANGE_FIXED_FIXED, MEM_FIXED)
    yield ['']
    yield * handleRange(addressing.TRUE_RANGE_VARIABLE_FIXED_1, MEM_SWITCHABLE + ' ' + MEM_FIXED)
    yield ['']
    // Perhaps have addressing able to express this range along with other high ranges referenced on the actual GAP
    // version of this page?
    // They're not used anywhere else however.
    yield ['02,2000', ' TO ', '03,3777', '  ', MEM_SPECIAL]
    yield ['']
    yield * handleRange(addressing.TRUE_RANGE_VARIABLE_FIXED_2, MEM_SWITCHABLE + ' ' + MEM_FIXED)

    function * handleRange (range: addressing.Range, desc: string): Generator<string[]> {
      const minOffset = addressing.memoryOffset(range.min)
      const maxOffset = addressing.memoryOffset(range.max)
      let type = cells[minOffset] === undefined ? MEM_AVAIL : MEM_RESERVED
      let rangeStart = minOffset

      for (let i = minOffset + 1; i <= maxOffset; i++) {
        if (cells[i] === undefined) {
          if (type === MEM_RESERVED) {
            yield handle(addressing.memoryAddress(rangeStart), addressing.memoryAddress(i - 1), type, desc)
            type = MEM_AVAIL
            rangeStart = i
          }
        } else if (type === MEM_AVAIL) {
          yield handle(addressing.memoryAddress(rangeStart), addressing.memoryAddress(i - 1), type, desc)
          type = MEM_RESERVED
          rangeStart = i
        }
      }

      yield handle(addressing.memoryAddress(rangeStart), addressing.memoryAddress(maxOffset), type, desc)
    }

    function handle (min: number, max: number, type: string, desc?: string): string[] {
      const endString = addressing.asAssemblyString(max).padStart(7)
      const startString = (min === max ? '' : addressing.asAssemblyString(min)).padStart(7)
      const completeDesc = type + (desc === undefined ? '' : ' ' + desc)
      return [startString, ' TO ', endString, '  ', completeDesc]
    }
  }
}

export function printParagraphs (printer: PrinterContext, container: Cells): void {
  const cells = container.getCells()

  // Ref SYM, IIF
  const header = 'PARAGRAPHS GENERATED FOR THIS ASSEMBLY; ADDRESS LIMITS AND THE MANUFACTURING LOCATION CODE ARE SHOWN FOR EACH'
  let row = 0

  for (let i = addressing.FIXED_MEMORY_OFFSET; i < cells.length; i += 256) {
    if ((row % 45) === 0) {
      printer.printPageBreak()
      printer.println(header)
      printer.println('')
    }
    ++row

    const address = addressing.memoryAddress(i)
    const paragraph = addressing.paragraph(address)
    const bankAndAddress = addressing.asBankAndAddress(address)
    const bank = addressing.fixedBankNumber(address)

    if (address === 0x2000) {
      printer.println('')
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

      printer.println(
        minString, 'TO', maxString,
        'PARAGRAPH #', paragraphString,
        '         ROPE MODULE ', module,
        ', SIDE ', side,
        ', SENSE LINE SET ', set.toString().padStart(2),
        '(WIRES ' + wires.min.toString().padStart(3) + '-' + wires.max.toString().padStart(3) + ')'
      )
    }
  }
}

const OCTAL_LISTING_COLUMNS = {
  Paragraph: 3,
  Address: 7,
  Type: 5,
  Value: 5,
  Parity: 1
}

export function printOctalListing (printer: PrinterContext, container: Cells): void {
  const cells = container.getCells()
  let paragraph = -1

  for (let i = addressing.FIXED_MEMORY_OFFSET; i < cells.length; i += 8) {
    printLine(i, cells)
  }

  function printLine (startIndex: number, cells: Cell[]): void {
    interface PrintEntry {
      type: string
      value: string
      parity: string
    }

    const address = addressing.memoryAddress(startIndex)
    const addressString = addressing.asAssemblyString(address).padStart(OCTAL_LISTING_COLUMNS.Address, ' ')

    const addressParagraph = addressing.paragraph(address)
    if (addressParagraph !== undefined && addressParagraph !== paragraph) {
      paragraph = addressParagraph
      printer.printPageBreak()
      printer.println(
        'OCTAL LISTING FOR PARAGRAPH #',
        paragraph.toString(8).padStart(OCTAL_LISTING_COLUMNS.Paragraph, '0') + ',',
        ' WITH PARITY BIT IN BINARY AT THE RIGHT OF EACH WORD, "@" DENOTES UNUSED FIXED MEMORY')
      printer.println('')
      printer.println('ALL VALID WORDS ARE BASIC INSTRUCTIONS EXCEPT THOSE MARKED "I" (INTERPRETIVE OPERATOR WORDS) OR "C" (CONSTANT)')
      printer.println('')
    } else if (startIndex % 32 === 0) {
      printer.println('')
    }

    const entries: PrintEntry[] = []
    for (let i = startIndex; i < startIndex + 8; i++) {
      const result = entry(cells[i])
      result.type = result.type.padStart(OCTAL_LISTING_COLUMNS.Type, ' ')
      result.value = result.value.padStart(OCTAL_LISTING_COLUMNS.Value, '0')
      result.parity = result.parity.padStart(OCTAL_LISTING_COLUMNS.Parity, ' ')
      entries.push(result)
    }

    printer.println(
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

export function printOctalListingCompact (printer: PrinterContext, container: Cells): void {
  const cells = container.getCells()

  for (let i = addressing.FIXED_MEMORY_OFFSET; i < cells.length; i += 8) {
    printLine(i, cells)
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

    printer.println(...entries)
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
  columnSeparator: 7,
  rowsPerPage: 49,
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

export function printOccupied (printer: PrinterContext, container: Cells): void {
  const cells = container.getCells()
  const context: OccupiedContext = {
    cells,
    startIndex: 0,
    page: 0,
    lineCount: 0
  }

  printTable(printer, OCCUPIED_TABLE_DATA, entries())

  function * entries (): Generator<[number, OccupiedContext]> {
    for (let i = 0; i < cells.length; i++) {
      yield [i, context]
    }
  }
}
