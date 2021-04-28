import { isGap, isYul, YulVersion } from './bootstrap'
import { Cell } from './cells'
import * as mem from './memory'
import * as parse from './parser'
import { Pass2Output } from './pass2'
import { PrintContext } from './printer-utils'
import { printTable, TableData } from './table-printer'
import { parity } from './util'

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
  entryString: (context: PrintContext, entry: string[]) => entry.join(' ').padEnd(60),
  separator: () => false
}

const MEMORY_SUMMARY_YUL_TABLE_DATA: TableData<string[]> = {
  columns: 2,
  columnWidth: 60,
  columnGap: 4,
  rowsPerPage: 50,
  rowBreaks: 4,
  reflowLastPage: true,
  pageHeader: ['MEMORY TYPE & AVAILABILITY DISPLAY'],
  entryString: (context: PrintContext, entry: string[]) => entry.join(' ').padEnd(60),
  separator: () => false
}

export function printMemorySummary (pass2: Pass2Output, context: PrintContext): void {
  const cells = pass2.cells.getCells()
  const memory = context.memory
  const def = isYul(context.options.yulVersion) ? MEMORY_SUMMARY_YUL_TABLE_DATA : MEMORY_SUMMARY_GAP_TABLE_DATA

  printTable(context, def, entries())

  function * entries (): Generator<string[]> {
    const yul = isYul(context.options.yulVersion)
    const ranges = memory.memoryRanges()
    let i = 0

    while (i < ranges.length) {
      const end = endRange(i)
      const range = combineRanges(ranges[i], ranges[end])
      if (i > 0 && !yul) {
        yield ['']
      }
      yield * handleRange(range)
      i = end + 1
    }

    function endRange (start: number): number {
      const range = ranges[start]
      if (range.type === mem.MemoryType.Hardware) {
        return start + 1
      } else if (range.type === mem.MemoryType.Unswitched_Banked_Erasable && yul) {
        while (++start < ranges.length && ranges[start].type !== mem.MemoryType.Fixed_Fixed);
      } else {
        while (++start < ranges.length && ranges[start].type === range.type);
      }
      return start - 1
    }

    function combineRanges (start: mem.MemoryRange, end: mem.MemoryRange): mem.MemoryRange {
      switch (start.type) {
        case mem.MemoryType.Hardware:
          return { min: start.min, max: end.max - 1, type: mem.MemoryType.Special_Erasable }

        case mem.MemoryType.Unswitched_Banked_Erasable:
          return { min: start.min - 1, max: end.max, type: start.type }

        default:
          return { min: start.min, max: end.max, type: start.type }
      }
    }

    function * handleRange (range: mem.MemoryRange): Generator<string[]> {
      const desc = getDesc(range)
      if (desc === MEM_SPECIAL) {
        yield handleAddresses(range.min, range.max, desc)
        return
      }

      const minOffset = memory.memoryOffset(range.min)
      const maxOffset = memory.memoryOffset(range.max)
      let type = cells[minOffset] === undefined ? MEM_AVAIL : MEM_RESERVED
      let rangeStart = minOffset

      for (let i = minOffset + 1; i <= maxOffset; i++) {
        if (cells[i] === undefined) {
          if (type === MEM_RESERVED) {
            const rangeEnd = adjustEnd(i - 1)
            yield handle(rangeStart, rangeEnd, desc, type)
            type = MEM_AVAIL
            rangeStart = rangeEnd + 1
          }
        } else if (type === MEM_AVAIL) {
          yield handle(rangeStart, i - 1, desc, type)
          type = MEM_RESERVED
          rangeStart = i
        }
      }

      yield handle(rangeStart, maxOffset, desc, type)
    }

    function getDesc (range: mem.MemoryRange): string {
      switch (range.type) {
        case mem.MemoryType.Nonexistent:
        case mem.MemoryType.Hardware:
        case mem.MemoryType.Special_Erasable:
          return MEM_SPECIAL

        case mem.MemoryType.Unswitched_Banked_Erasable:
          return MEM_ERASABLE

        case mem.MemoryType.Switched_Erasable:
          return (!yul ? MEM_SWITCHABLE + ' ' : '') + MEM_ERASABLE

        case mem.MemoryType.Fixed_Fixed:
          return MEM_FIXED

        case mem.MemoryType.Variable_Fixed:
          return (!yul ? MEM_SWITCHABLE + ' ' : '') + MEM_FIXED
      }
    }

    function adjustEnd (max: number): number {
      // Y1966 and earlier do not consider the checksum cell "used"
      const maxCell = cells[max]
      if (context.options.yulVersion <= YulVersion.Y1966
        && maxCell !== undefined
        && parse.isClerical(maxCell.definition.card)
        && maxCell.definition.card.operation.operation === context.operations.BNKSUM) {
        return max - 1
      }
      return max
    }

    function handle (min: number, max: number, desc: string, type?: string): string[] {
      const addressMin = memory.memoryAddress(min)
      const addressMax = memory.memoryAddress(max)
      return handleAddresses(addressMin, addressMax, desc, type)
    }

    function handleAddresses (addressMin: number, addressMax: number, desc: string, type?: string): string[] {
      const endString = memory.asAssemblyString(addressMax).padStart(7)
      const startString = (addressMin === addressMax ? '' : memory.asAssemblyString(addressMin)).padStart(7)
      const completeDesc = (type === undefined ? '' : (type + ' ')) + desc
      return [startString, ' TO ', endString, '  ', completeDesc]
    }
  }
}

function cacheUsedParagraphs (cells: Cell[], context: PrintContext): boolean[] {
  let used = context.cache.get('usedParagraphs') as boolean[]
  if (used === undefined) {
    const start = context.memory.fixedMemoryOffset()
    used = []
    for (let i = start; i < cells.length; i += 256) {
      used.push(!isParagraphEmpty(i, cells))
    }
    context.cache.set('usedParagraphs', used)
  }
  return used

  function isParagraphEmpty (start: number, cells: Cell[]): boolean {
    for (let i = start; i < start + 256; i++) {
      if (cells[i]?.value !== undefined) {
        return false
      }
    }
    return true
  }
}

const PARAGRAPHS_HEADER = 'PARAGRAPHS GENERATED FOR THIS ASSEMBLY; ADDRESS LIMITS AND THE MANUFACTURING LOCATION CODE ARE SHOWN FOR EACH'

export function printParagraphs (pass2: Pass2Output, context: PrintContext): void {
  const cells = pass2.cells.getCells()
  const memory = context.memory
  const rowsPerPage = isYul(context.options.yulVersion) ? 50 : 45

  const header = PARAGRAPHS_HEADER + (isYul(context.options.yulVersion) ? '.' : '')
  let row = 0
  let separator = 0

  if (context.options.formatted) {
    context.printer.endPage()
    context.printer.println(header)
    context.printer.println('')
  }

  // Ref SYM, IIF
  const start = memory.fixedMemoryOffset()
  const used = cacheUsedParagraphs(cells, context)
  let usedOffset = 0
  for (let i = start; i < cells.length; i += 256) {
    if (!used[usedOffset++]) {
      ++separator
      continue
    }
    if (isYul(context.options.yulVersion) && ++separator === 5) {
      context.printer.println('')
      ++row
      separator = 1
    }
    if (row >= rowsPerPage) {
      if (context.options.formatted) {
        context.printer.endPage()
        context.printer.println(header)
        context.printer.println('')
      }
      row = 0
    }
    ++row

    const address = memory.memoryAddress(i)
    const paragraph = memory.paragraph(address)
    const bankAndAddress = memory.asBankAndAddress(address)
    const bank = memory.fixedBankNumber(address)

    if (isGap(context.options.yulVersion) && address === 0x2000) {
      context.printer.println('')
      // First page has 1 fewer line than other pages, so skip an extra here.
      row += 2
    }

    if (paragraph !== undefined && bankAndAddress !== undefined && bank !== undefined) {
      const sRegister = bankAndAddress.address
      const minString = memory.asAssemblyString(address).padStart(7)
      const maxString = memory.asAssemblyString(address + 255).padStart(7)
      const paragraphString = paragraph.toString(8).padStart(3, '0')
      const module = memory.hardwareModule(bank)
      const side = memory.hardwareSide(sRegister)
      const set = memory.hardwareStrand(bank, sRegister)
      const wires = memory.hardwareWires(set)

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
  const memory = context.memory
  const ofFor = isYul(context.options.yulVersion) ? 'OF' : 'FOR'
  const punct = isYul(context.options.yulVersion) ? ';' : ','
  const period = isYul(context.options.yulVersion) ? '.' : ''
  const used = cacheUsedParagraphs(cells, context)
  let usedOffset = 0

  const start = memory.fixedMemoryOffset()
  for (let i = start; i < cells.length; i += 256) {
    printParagraph(i, cells)
    ++usedOffset
  }

  function printParagraph (startIndex: number, cells: Cell[]): void {
    const paragraph = memory.paragraph(memory.memoryAddress(startIndex))
    if (paragraph === undefined || !used[usedOffset]) {
      return
    }

    if (context.options.formatted) {
      context.printer.endPage()
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

    const address = memory.memoryAddress(startIndex)
    const addressString = memory.asAssemblyString(address).padStart(OCTAL_LISTING_COLUMNS.Address, ' ')

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
        if (card.operation.operation === context.operations.P) {
          type = 'I:'
        } else {
          type = 'C:'
        }
      } else if (parse.isNumericConstant(card)) {
        type = 'C:'
      } else if (parse.isClerical(card)) {
        if (card.operation.operation === context.operations.BNKSUM) {
          type = 'CKSM'
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
  const memory = context.memory

  if (context.options.formatted) {
    context.printer.endPage()
    context.printer.println('OCTAL COMPACT LISTING')
    context.printer.println('ADDRESS   0     1     2     3     4     5     6     7')
  }
  const used = cacheUsedParagraphs(cells, context).slice()
  const restUnused: boolean[] = []
  let test = true
  used.reverse().forEach(element => {
    if (element) {
      test = false
    }
    restUnused.push(test)
  })
  restUnused.reverse()

  let usedOffset = 0
  const start = memory.fixedMemoryOffset()
  for (let i = start; i < cells.length && !restUnused[usedOffset++]; i += 256) {
    printParagraph(i, cells)
  }

  function printParagraph (startIndex: number, cells: Cell[]): void {
    for (let i = startIndex; i < startIndex + 256; i += 8) {
      printLine(i, cells)
    }
  }

  function printLine (startIndex: number, cells: Cell[]): void {
    const address = memory.memoryAddress(startIndex)
    const addressString = memory
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

function occupiedEntryString (print: PrintContext, data: [number, OccupiedContext]): string | undefined {
  const memory = print.memory
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
      const endAddress = memory.memoryAddress(index - 1)
      const endString = memory.asAssemblyString(endAddress).padStart(OCCUPIED_COLUMNS.End, ' ')
      if (startIndex === index - 1) {
        return ' '.padStart(OCCUPIED_COLUMNS.Start)
          + ' TO '
          + ' ' + endString.padStart(OCCUPIED_COLUMNS.End)
          + ' ' + oldPage.toString().padStart(OCCUPIED_COLUMNS.Page)
      } else {
        const startAddress = memory.memoryAddress(startIndex)
        const startString = memory.asAssemblyString(startAddress).padStart(OCCUPIED_COLUMNS.Start, ' ')

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
  const memory = context.memory
  const occupiedContext: OccupiedContext = {
    cells,
    startIndex: 0,
    page: 0,
    lineCount: 0
  }

  printTable(context, OCCUPIED_TABLE_DATA, entries())

  function * entries (): Generator<[number, OccupiedContext]> {
    const start = memory.fixedMemoryOffset()
    for (let i = start; i < cells.length; i++) {
      yield [i, occupiedContext]
    }
  }
}
