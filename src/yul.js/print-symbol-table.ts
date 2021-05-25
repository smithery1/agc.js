import { AssembledCard } from './assembly'
import { h800Group } from './charset'
import * as ops from './operations'
import { AssemblerEnum, Options } from './options'
import * as parse from './parser'
import { Pass2Output } from './pass2'
import { PrintContext } from './printer'
import { SymbolEntry } from './symbol-table'
import { printTable, TableData } from './table-printer'

function cacheSortedTable (pass2: Pass2Output, context: PrintContext): Array<[string, SymbolEntry]> {
  const table = pass2.symbolTable.getTable()
  let sorted = context.cache.get('sortedSymbolTable') as Array<[string, SymbolEntry]>
  if (sorted === undefined) {
    sorted = [...table.entries()].sort(
      (e1: [string, SymbolEntry], e2: [string, SymbolEntry]) => {
        return context.charset.compare(e1[0], e2[0])
      })
    context.cache.set('sortedSymbolTable', sorted)
  }
  return sorted
}

export function printSymbols (pass2: Pass2Output, context: PrintContext): void {
  const sorted = cacheSortedTable(pass2, context)
  if (context.options.assembler.isAtMost(AssemblerEnum.Y1965)) {
    printY1965Symbols(context, sorted.values())
  } else {
    const tableData = context.options.assembler.isYul() ? ALL_YUL_TABLE_DATA : ALL_GAP_TABLE_DATA
    printTable(context, tableData, sorted.values())
  }
}

export function printUndefinedSymbols (pass2: Pass2Output, context: PrintContext): void {
  // TODO
}

export function printUnreferencedSymbols (pass2: Pass2Output, context: PrintContext): void {
  const sorted = cacheSortedTable(pass2, context)
  printTable(context, UNREF_TABLE_DATA, sorted.values())
}

export function printCrossReference (pass2: Pass2Output, context: PrintContext): void {
  const table = pass2.symbolTable.getTable()
  const sorted = [...table.entries()].sort(valueSort)
  const version = context.options.assembler.assembler()
  const def = version === AssemblerEnum.Y1966L
    ? XREF_YUL_66_TABLE_DATA
    : (version === AssemblerEnum.Y1967 ? XREF_YUL_67_TABLE_DATA : XREF_GAP_TABLE_DATA)
  printTable(context, def, sorted.values())

  function valueSort (e1: [string, SymbolEntry], e2: [string, SymbolEntry]): number {
    const value1 = e1[1].value
    const value2 = e2[1].value

    if (value1 === value2) {
      // I can't make out YUL 66's secondary sort order when values are equal.
      // It's *almost* but not quite by symbol.
      // See Sunburst37 scans page 1079.
      // Something to look into in more detail at some point.
      if (!context.options.assembler.isYul()) {
        const page1 = e1[1].definition.lexedLine.sourceLine.page
        const page2 = e2[1].definition.lexedLine.sourceLine.page

        if (page1 === page2) {
          return context.charset.compare(e1[0], e2[0])
        }
        return page1 < page2 ? -1 : 1
      } else {
        return context.charset.compare(e1[0], e2[0])
      }
    }
    return value1 < value2 ? -1 : 1
  }
}

export function printTableSummary (pass2: Pass2Output, context: PrintContext): void {
  printSummary(context, pass2.symbolTable.getTable(), context.options)
}

function isEqualsCard (operations: ops.Operations, card: any): boolean {
  return parse.isClerical(card)
    && (card.operation.operation === operations.operation('EQUALS')
      || card.operation.operation === operations.operation('=MINUS')
      || card.operation.operation === operations.operation('=PLUS'))
}

function isEraseCard (operations: ops.Operations, card: any): boolean {
  return parse.isClerical(card) && card.operation.operation === operations.operation('ERASE')
}

function healthString (operations: ops.Operations, entry: SymbolEntry): string {
  if (entry.health === undefined) {
    return isEqualsCard(operations, entry.definition.card) ? '=' : ' '
  } else {
    return entry.health
  }
}

function getFirstLastReferences (references: AssembledCard[]): { first: number, last: number } {
  let first = Number.MAX_SAFE_INTEGER
  let last = -1
  references.forEach(ref => {
    const page = ref.lexedLine.sourceLine.page
    if (page < first) {
      first = page
    }
    if (page > last) {
      last = page
    }
  })
  if (first === Number.MAX_SAFE_INTEGER) {
    first = -1
  } else if (last === first) {
    last = -1
  }
  return { first, last }
}

function symbolSeparator (
  context: PrintContext, entry: [string, SymbolEntry], lastEntry: [string, SymbolEntry]): boolean {
  return entry[0].charAt(0) !== lastEntry[0].charAt(0)
}

const ALL_GAP_COLUMNS = {
  Symbol: 8,
  Value: 7,
  Health: 2,
  Page: 4,
  Refs: 4,
  AllRefs: 4 + 1 + 4 + 1 + 4 + 1 + 4,
  Entry: 8 + 1 + 7 + 1 + 2 + 1 + 4 + 1 + 4 + 1 + 4 + 1 + 4
}

const ALL_GAP_TABLE_DATA: TableData<[string, SymbolEntry]> = {
  columns: 3,
  columnWidth: ALL_GAP_COLUMNS.Entry,
  rowsPerPage: 45,
  pageHeader: [
    'SYMBOL TABLE LISTING, INCLUDING DEFINITION, HEALTH, PAGE OF DEF, # OF REFS, PAGE OF FIRST REF, PAGE OF LAST REF.'
  ],
  pageFooter: [
    'HEALTH KEY: NORMALLY DEFINED UNLESS FLAGGED AS FOLLOWS:',
    '',
    'UN UNDEFINED         = DEFINED BY EQUALS            J DEFINED BY JOKER OR ERASE ANYWHERE     MD MULTIPLY DEFINED',
    'BD BADLY DEFINED     CD DEFINITION ASSOCIATED WITH CONFLICT             XX MISCELLANEOUS TROUBLE'
  ],
  tableHeader:
    'SYMBOL'.padEnd(ALL_GAP_COLUMNS.Symbol)
    + ' ' + '  DEF'.padEnd(ALL_GAP_COLUMNS.Value)
    + ' ' + 'H'.padStart(ALL_GAP_COLUMNS.Health)
    + ' ' + '     REFERENCES'.padEnd(ALL_GAP_COLUMNS.AllRefs),
  entryString: allGapEntryString,
  separator: symbolSeparator
}

function allGapEntryString (context: PrintContext, data: [string, SymbolEntry]): string | undefined {
  const symbol = data[0]
  const entry = data[1]
  const health = healthString(context.operations, entry)
  const page = entry.definition.lexedLine.sourceLine.page
  const references = entry.references.length
  const firstLast = getFirstLastReferences(entry.references)
  const refsString = references === 0 ? '' : references.toString()

  return symbol.padEnd(ALL_GAP_COLUMNS.Symbol)
    + ' ' + context.memory.asAssemblyString(entry.value).padStart(ALL_GAP_COLUMNS.Value)
    + ' ' + health.padStart(ALL_GAP_COLUMNS.Health)
    + ' ' + page.toString().padStart(ALL_GAP_COLUMNS.Page)
    + ' ' + refsString.padStart(ALL_GAP_COLUMNS.Refs)
    + ' ' + (firstLast.first < 0 ? '' : firstLast.first.toString()).padStart(ALL_GAP_COLUMNS.Page)
    + ' ' + (firstLast.last < 0 ? '' : firstLast.last.toString()).padStart(ALL_GAP_COLUMNS.Page)
}

const ALL_YUL_COLUMNS = {
  Symbol: 8,
  Health: 1,
  Def: 7,
  Page: 4,
  Refs: 4,
  Flag: 1,
  AllRefs: 4 + 1 + 4 + 1 + 4 + 1 + 4 + 1,
  Entry: 2 + 8 + 1 + 1 + 7 + 1 + 4 + 4 + 4 + 1 + 4 + 1
}

const ALL_YUL_TABLE_DATA: TableData<[string, SymbolEntry]> = {
  columns: 3,
  columnWidth: ALL_YUL_COLUMNS.Entry,
  columnGap: '|',
  rowsPerPage: 43,
  pageHeader: [
    'SYMBOL TABLE LISTING, INCLUDING PAGE NUMBER OF DEFINITION, AND NUMBER OF REFERENCES WITH FIRST AND LAST PAGE NUMBERS'
  ],
  pageFooter: [
    'KEY: SYMBOLS DEFINED BY EQUALS ARE FLAGGED =.  OTHERS ARE NORMALLY DEFINED EXCEPT THOSE FLAGGED:',
    '',
    'U UNDEFINED             E FAILED LEFTOVER ERASE   M MULTIPLY DEFINED           T WRONG MEMORY TYPE    MM MULTIPLE ERRORS',
    'N NEARLY DEFINED BY =   J FAILED LEFTOVER WORD    O OVERSIZE- OR ILL_DEFINED   C CONFLICT IN MEMORY   X  MISC. TROUBLE'
  ],
  tableHeader:
    '  SYMBOL H'
    + '   DEFINITION'
    + '   REFERENCES'
    + ' ' + 'F',
  entryString: allYulEntryString,
  separator: symbolSeparator
}

const ALL_YUL_EMPTY_REFS = '  -   -   - '

function allYulEntryString (context: PrintContext, data: [string, SymbolEntry]): string | undefined {
  const symbol = data[0]
  const entry = data[1]
  const health = entry.health === undefined ? ' ' : entry.health
  const flag = entry.health === undefined && isEqualsCard(context.operations, entry.definition.card) ? '=' : ' '
  const page = entry.definition.lexedLine.sourceLine.page
  const references = entry.references.length
  const firstLast = getFirstLastReferences(entry.references)
  const isY1966E = context.options.assembler.assembler() === AssemblerEnum.Y1966E
  const padPageOffset = isY1966E ? -1 : 0
  const emptyRefsPrefix = isY1966E ? ' ' : ''
  let refsString: string

  if (references === 0) {
    refsString = emptyRefsPrefix + ALL_YUL_EMPTY_REFS
  } else {
    refsString = references.toString().padStart(ALL_YUL_COLUMNS.Refs - padPageOffset)
      + firstLast.first.toString().padStart(ALL_YUL_COLUMNS.Page)
      + (firstLast.last < 0 ? '' : firstLast.last.toString()).padStart(ALL_YUL_COLUMNS.Page)
  }

  return '  ' + symbol.padEnd(ALL_YUL_COLUMNS.Symbol)
  + health.padEnd(ALL_YUL_COLUMNS.Health)
    + ' ' + context.memory.asAssemblyString(entry.value).padStart(ALL_YUL_COLUMNS.Def)
    + ' ' + page.toString().padStart(ALL_YUL_COLUMNS.Page + padPageOffset)
    + refsString
    + ' ' + flag
}

const UNREF_COLUMNS = {
  Symbol: 8,
  Value: 7,
  Health: 2,
  Page: 4,
  Padding: 5,
  Entry: 8 + 1 + 7 + 1 + 2 + 1 + 4
}

const UNREF_TABLE_DATA: TableData<[string, SymbolEntry]> = {
  columns: 4,
  columnWidth: UNREF_COLUMNS.Entry,
  columnGap: UNREF_COLUMNS.Padding,
  rowsPerPage: 45,
  pageHeader: ['UNREFERENCED SYMBOL LISTING, INCLUDING DEFINITION, HEALTH, & PAGE OF DEFINITION.'],
  tableHeader:
    'SYMBOL'.padEnd(UNREF_COLUMNS.Symbol)
    + ' ' + '  DEF'.padEnd(UNREF_COLUMNS.Value)
    + ' ' + 'H'.padStart(UNREF_COLUMNS.Health)
    + ' ' + 'PAGE'.padEnd(UNREF_COLUMNS.Page),
  entryString: unrefEntryString,
  separator: symbolSeparator
}

function unrefEntryString (context: PrintContext, data: [string, SymbolEntry]): string | undefined {
  const symbol = data[0]
  const entry = data[1]
  if (entry.references.length === 0) {
    const health = healthString(context.operations, entry)
    const page = entry.definition.lexedLine.sourceLine.page
    return symbol.padEnd(UNREF_COLUMNS.Symbol)
      + ' ' + context.memory.asAssemblyString(entry.value).padStart(UNREF_COLUMNS.Value)
      + ' ' + health.padStart(UNREF_COLUMNS.Health)
      + ' ' + page.toString().padStart(UNREF_COLUMNS.Page)
  }
}

const XREF_COLUMNS = {
  Def: 7,
  Page: 4,
  Symbol: 8,
  Entry: 4 + 1 + 4 + 1 + 8
}

const XREF_GAP_TABLE_DATA: TableData<[string, SymbolEntry]> = {
  columns: 5,
  columnWidth: XREF_COLUMNS.Entry,
  columnGap: 1,
  rowsPerPage: 45,
  pageHeader: ['ERASABLE & EQUALS CROSS-REFERENCE TABLE SHOWING DEFINITION, PAGE OF DEFINITION, AND SYMBOL'],
  tableHeader:
  '   DEF'.padEnd(XREF_COLUMNS.Def)
    + ' ' + 'PAGE'.padEnd(XREF_COLUMNS.Page)
    + '  ' + 'SYMBOL'.padEnd(XREF_COLUMNS.Symbol),
  entryString: xrefEntryString
}

const XREF_YUL_67_TABLE_DATA: TableData<[string, SymbolEntry]> = {
  columns: 5,
  columnWidth: XREF_COLUMNS.Entry,
  columnGap: 1,
  rowsPerPage: 50,
  rowBreaks: 4,
  pageHeader: ['ERASABLE & EQUIVALENCE CROSS-REFERENCE TABLE: SHOWING DEFINITION, PAGE OF DEFINITION, AND SYMBOL'],
  entryString: xrefEntryString
}

const XREF_YUL_66_TABLE_DATA: TableData<[string, SymbolEntry]> = {
  columns: 5,
  columnWidth: XREF_COLUMNS.Entry,
  columnGap: 1,
  // There is some sort of pagination bug in YUL66 where an inappropriate blank line is inserted halfway down the page,
  // resulting in a single line on the next page.
  // See Sunburst37 scans page 1081.
  // We don't reproduce that here, but it means it's hard to compare the table and page numbers are annoyingly off.
  // Could do it later.
  rowsPerPage: 50,
  rowBreaks: 4,
  pageHeader: ['ERASABLE & EQUIVALENCE CROSS-REFERENCE TABLE: SHOWING DEFINITION, PAGE OF DEFINITION, AND SYMBOL'],
  entryString: xrefYul66EntryString
}

function xrefEntryString (context: PrintContext, data: [string, SymbolEntry]): string | undefined {
  const entry = data[1]
  if (isEqualsCard(context.operations, entry.definition.card)
    || isEraseCard(context.operations, entry.definition.card)) {
    const symbol = data[0]
    const def = entry.value
    const page = entry.definition.lexedLine.sourceLine.page
    return context.memory.asAssemblyString(def).padStart(XREF_COLUMNS.Def)
        + ' ' + page.toString().padStart(XREF_COLUMNS.Page)
        + '  ' + symbol.padEnd(XREF_COLUMNS.Symbol)
  }
}

function xrefYul66EntryString (context: PrintContext, data: [string, SymbolEntry]): string | undefined {
  const entry = data[1]
  if (isEqualsCard(context.operations, entry.definition.card)
    || isEraseCard(context.operations, entry.definition.card)) {
    const symbol = data[0]
    const def = entry.value
    const page = entry.definition.lexedLine.sourceLine.page
    return symbol.padEnd(XREF_COLUMNS.Symbol)
      + ' ' + context.memory.asAssemblyString(def).padStart(XREF_COLUMNS.Def)
        + ' ' + page.toString().padStart(XREF_COLUMNS.Page)
  }
}

function printSummary (context: PrintContext, table: Map<string, SymbolEntry>, options: Options): void {
  let normal = 0
  let equals = 0
  let unreferenced = 0
  table.forEach(entry => {
    if (isEqualsCard(context.operations, entry.definition.card)) {
      ++equals
      if (entry.references.length === 0) {
        ++unreferenced
      }
    } else {
      ++normal
    }
  })

  const printer = context.printer
  const total = normal + equals
  let unrefString = ''
  const isY1965 = context.options.assembler.isAtMost(AssemblerEnum.Y1965)
  if (isY1965) {
    equals -= unreferenced
    unrefString = unreferenced.toString()
  }
  let normalString = normal.toString()
  let equalsString = equals.toString()
  const len = Math.max(normalString.length, equalsString.length, unrefString.length)
  const line = '-'.repeat(len).padStart(14)
  normalString = normalString.padStart(14)
  equalsString = equalsString.padStart(14)
  unrefString = unrefString.padStart(14)
  const totalString = total.toString().padStart(7)
  printer.endPage()
  if (options.assembler.isYul()) {
    if (options.formatted) {
      if (isY1965) {
        printer.println('SUMMARY OF SYMBOL TABLE ANALYSIS')
      } else {
        printer.println('SUMMARY OF SYMBOL TABLE LISTING')
      }
    }
    printer.println('')
    if (isY1965) {
      printer.println(unrefString, 'DEFINED BY EQUALS BUT NEVER REFERENCED')
      printer.println('')
    }
    printer.println(equalsString, ' DEFINED BY EQUALS')
    printer.println('')
    printer.println(normalString, ' NORMALLY DEFINED')
    printer.println(line)
    printer.println('')
    printer.println('TOTAL:', totalString)
  } else {
    if (options.formatted) {
      printer.println('SUMMARY OF SYMBOL TABLE LISTINGS')
    }
    printer.println('')
    printer.println(normalString, ' DEFINED NORMALLY')
    printer.println('')
    printer.println(equalsString, ' DEFINED BY EQUALS')
    printer.println(line)
    printer.println('')
    printer.println('TOTAL:', totalString)
  }
}

const ALL_B1965_COLUMNS = {
  Symbol: 8,
  Def: 7,
  Health: 75,
  Page: 4
}
const ALL_B1965_HEADER = ' SYMBOL    DEFINITION   ' + 'HEALTH OF DEFINITION'.padEnd(ALL_B1965_COLUMNS.Health) + ' PAGE'
const ALL_B1965_ROWS = 50
function printY1965Symbols (context: PrintContext, entries: Iterator<[string, SymbolEntry]>): void {
  const printer = context.printer
  let row = 0
  let lastSymbol: string | undefined

  if (context.options.formatted) {
    printer.endPage()
    printer.println(ALL_B1965_HEADER)
    printer.println()
  }

  for (let next = entries.next(); next.done !== true; next = entries.next()) {
    const symbol = next.value[0].padEnd(ALL_B1965_COLUMNS.Symbol)
    const entry = next.value[1]
    const def = context.memory.asAssemblyString(entry.value).padStart(ALL_B1965_COLUMNS.Def)
    const health = healthString(context.operations, entry).padEnd(ALL_B1965_COLUMNS.Health)
    const page = entry.definition.lexedLine.sourceLine.page.toString().padStart(ALL_B1965_COLUMNS.Page)

    if (lastSymbol !== undefined) {
      let skipLines = 0

      if (symbol.charAt(0) !== lastSymbol.charAt(0)) {
        skipLines = 2
      } else if (h800Group(symbol) !== h800Group(lastSymbol)) {
        skipLines = 1
      }

      if (skipLines > 0) {
        row += skipLines
        if (row < ALL_B1965_ROWS) {
          while (skipLines > 0) {
            printer.println()
            --skipLines
          }
        } else {
          row = ALL_B1965_ROWS
        }
      }
    }

    if (row >= ALL_B1965_ROWS) {
      row = 0
      if (context.options.formatted) {
        printer.endPage()
        printer.println(ALL_B1965_HEADER)
        printer.println()
      }
    }

    printer.println(symbol, '  ', def, '   ', health, page)
    lastSymbol = symbol
    ++row
  }

  function healthString (operations: ops.Operations, entry: SymbolEntry): string {
    if (entry.health === undefined) {
      if (isEqualsCard(operations, entry.definition.card)) {
        if (entry.references.length === 0) {
          return 'DEFINED BY EQUALS BUT NEVER REFERRED TO'
        } else {
          return 'DEFINED BY EQUALS'
        }
      }
      return 'NORMALLY DEFINED'
    } else {
      return entry.health
    }
  }
}
