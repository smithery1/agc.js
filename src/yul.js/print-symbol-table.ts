import * as addressing from './addressing'
import { AssembledCard } from './assembly'
import { Mode, Options } from './bootstrap'
import * as ops from './operations'
import * as parse from './parser'
import { Pass2Output } from './pass2'
import { PrintContext, PrinterContext } from './printer-utils'
import { SymbolEntry } from './symbol-table'
import { printTable, TableData } from './table-printer'

const EQUALS_OP = ops.requireOperation('EQUALS')
const ERASE_OP = ops.requireOperation('ERASE')
const MINUS_ERASE_OP = ops.requireOperation('=MINUS')
const PLUS_ERASE_OP = ops.requireOperation('=PLUS')

function cacheSortedTable (pass2: Pass2Output, context: PrintContext): Array<[string, SymbolEntry]> {
  const table = pass2.symbolTable.getTable()
  if (context.sortedSymbolTable === undefined) {
    context.sortedSymbolTable = [...table.entries()].sort(
      (e1: [string, SymbolEntry], e2: [string, SymbolEntry]) => {
        return context.charset.compare(e1[0], e2[0])
      })
  }
  return context.sortedSymbolTable
}

export function printSymbols (pass2: Pass2Output, context: PrintContext): void {
  const sorted = cacheSortedTable(pass2, context)
  const tableData = context.options.mode === Mode.Yul ? ALL_YUL_TABLE_DATA : ALL_GAP_TABLE_DATA
  printTable(context.printer, tableData, sorted.values(), context.options)
  context.printer.endPage()
}

export function printUndefinedSymbols (pass2: Pass2Output, context: PrintContext): void {
  // TODO
}

export function printUnreferencedSymbols (pass2: Pass2Output, context: PrintContext): void {
  const sorted = cacheSortedTable(pass2, context)
  printTable(context.printer, UNREF_TABLE_DATA, sorted.values(), context.options)
  context.printer.endPage()
}

export function printCrossReference (pass2: Pass2Output, context: PrintContext): void {
  const table = pass2.symbolTable.getTable()
  const sorted = [...table.entries()].sort(valueSort)
  const def = context.options.mode === Mode.Yul ? XREF_YUL_TABLE_DATA : XREF_GAP_TABLE_DATA
  printTable(context.printer, def, sorted.values(), context.options)
  context.printer.endPage()

  function valueSort (e1: [string, SymbolEntry], e2: [string, SymbolEntry]): number {
    const value1 = e1[1].value
    const value2 = e2[1].value

    if (value1 === value2) {
      if (context.options.mode === Mode.Gap) {
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
  printSummary(context.printer, pass2.symbolTable.getTable(), context.options)
  context.printer.endPage()
}

function isEqualsCard (card: any): boolean {
  return parse.isClerical(card)
    && (card.operation.operation === EQUALS_OP
      || card.operation.operation === MINUS_ERASE_OP
      || card.operation.operation === PLUS_ERASE_OP)
}

function isEraseCard (card: any): boolean {
  return parse.isClerical(card) && card.operation.operation === ERASE_OP
}

function healthString (entry: SymbolEntry): string {
  if (entry.health === undefined) {
    return isEqualsCard(entry.definition.card) ? '=' : ' '
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

function symbolSeparator (entry: [string, SymbolEntry], lastEntry: [string, SymbolEntry]): boolean {
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

function allGapEntryString (data: [string, SymbolEntry]): string | undefined {
  const symbol = data[0]
  const entry = data[1]
  const health = healthString(entry)
  const page = entry.definition.lexedLine.sourceLine.page
  const references = entry.references.length
  const firstLast = getFirstLastReferences(entry.references)
  const refsString = references === 0 ? '' : references.toString()

  return symbol.padEnd(ALL_GAP_COLUMNS.Symbol)
    + ' ' + addressing.asAssemblyString(entry.value).padStart(ALL_GAP_COLUMNS.Value)
    + ' ' + health.padStart(ALL_GAP_COLUMNS.Health)
    + ' ' + page.toString().padStart(ALL_GAP_COLUMNS.Page)
    + ' ' + refsString.padStart(ALL_GAP_COLUMNS.Refs)
    + ' ' + (firstLast.first < 0 ? '' : firstLast.first.toString()).padStart(ALL_GAP_COLUMNS.Page)
    + ' ' + (firstLast.last < 0 ? '' : firstLast.last.toString()).padStart(ALL_GAP_COLUMNS.Page)
}

const ALL_YUL_COLUMNS = {
  Symbol: 8,
  Health: 2,
  Def: 7,
  Page: 4,
  Refs: 4,
  Flag: 1,
  AllRefs: 4 + 1 + 4 + 1 + 4 + 1 + 4 + 1,
  Entry: 8 + 1 + 2 + 1 + 7 + 1 + 4 + 4 + 4 + 1 + 4 + 1
}

const ALL_YUL_TABLE_DATA: TableData<[string, SymbolEntry]> = {
  columns: 3,
  columnWidth: ALL_YUL_COLUMNS.Entry,
  columnGap: 1,
  rowsPerPage: 43,
  pageHeader: [
    'SYMBOL TABLE LISTING, INCLUDING PAGE NUMBER OF DEFINITION, AND NUMBER OF REFERENCES WITH FIRST AND LAST PAGE NUMBERS'
  ],
  pageFooter: [
    'KEY: SYMBOLS DEFINED BY EQUALS ARE FLAGGED =.  OTHERS ARE NORMALLY DEFINED EXCEPTED THOSE FLAGGED:',
    '',
    'U UNDEFINED             E FAILED LEFTOVER ERASE   M MULTIPLY DEFINED          T WRONG MEMORY TYPE    MM MULTIPLE ERRORS',
    'N NEARLY DEFINED BY =   J FAILED LEFTOVER WORD    O OVERSIZE OR ILL_DEFINED   C CONFLICT IN MEMORY   X  MISC. TROUBLE'
  ],
  tableHeader:
    'SYMBOL'.padEnd(ALL_YUL_COLUMNS.Symbol)
    + 'H'.padEnd(ALL_YUL_COLUMNS.Health)
    + '   DEFINITION'
    + '   REFERENCES'
    + ' ' + 'F',
  entryString: allYulEntryString,
  separator: symbolSeparator
}

const ALL_YUL_EMPTY_REFS = '  -   -   - '

function allYulEntryString (data: [string, SymbolEntry]): string | undefined {
  const symbol = data[0]
  const entry = data[1]
  const health = entry.health === undefined ? ' ' : entry.health
  const flag = entry.health === undefined && isEqualsCard(entry.definition.card) ? '=' : ' '
  const page = entry.definition.lexedLine.sourceLine.page
  const references = entry.references.length
  const firstLast = getFirstLastReferences(entry.references)
  let refsString: string

  if (references === 0) {
    refsString = ALL_YUL_EMPTY_REFS
  } else {
    refsString = references.toString().padStart(ALL_YUL_COLUMNS.Refs)
      + firstLast.first.toString().padStart(ALL_GAP_COLUMNS.Page)
      + (firstLast.last < 0 ? '' : firstLast.last.toString()).padStart(ALL_GAP_COLUMNS.Page)
  }

  return symbol.padEnd(ALL_YUL_COLUMNS.Symbol)
  + ' ' + health.padEnd(ALL_YUL_COLUMNS.Health)
    + ' ' + addressing.asAssemblyString(entry.value).padStart(ALL_YUL_COLUMNS.Def)
    + ' ' + page.toString().padStart(ALL_YUL_COLUMNS.Page)
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

function unrefEntryString (data: [string, SymbolEntry]): string | undefined {
  const symbol = data[0]
  const entry = data[1]
  if (entry.references.length === 0) {
    const health = healthString(entry)
    const page = entry.definition.lexedLine.sourceLine.page
    return symbol.padEnd(UNREF_COLUMNS.Symbol)
      + ' ' + addressing.asAssemblyString(entry.value).padStart(UNREF_COLUMNS.Value)
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
  entryString: xrefEntryString,
  separator: () => false
}

const XREF_YUL_TABLE_DATA: TableData<[string, SymbolEntry]> = {
  columns: 5,
  columnWidth: XREF_COLUMNS.Entry,
  columnGap: 1,
  rowsPerPage: 50,
  rowBreaks: 4,
  pageHeader: ['ERASABLE & EQUIVALENCE CROSS-REFERENCE TABLE: SHOWING DEFINITION, PAGE OF DEFINITION, AND SYMBOL'],
  entryString: xrefEntryString,
  separator: () => false
}

function xrefEntryString (data: [string, SymbolEntry]): string | undefined {
  const entry = data[1]
  if (isEqualsCard(entry.definition.card) || isEraseCard(entry.definition.card)) {
    const symbol = data[0]
    const def = entry.value
    const page = entry.definition.lexedLine.sourceLine.page
    return addressing.asAssemblyString(def).padStart(XREF_COLUMNS.Def)
        + ' ' + page.toString().padStart(XREF_COLUMNS.Page)
        + '  ' + symbol.padEnd(XREF_COLUMNS.Symbol)
  }
}

function printSummary (printer: PrinterContext, table: Map<string, SymbolEntry>, options: Options): void {
  let normal = 0
  let equals = 0
  table.forEach(entry => {
    if (isEqualsCard(entry.definition.card)) {
      ++equals
    } else {
      ++normal
    }
  })

  const total = normal + equals
  let normalString = normal.toString()
  let equalsString = equals.toString()
  const len = Math.max(normalString.length, equalsString.length)
  const line = '-'.repeat(len).padStart(14)
  normalString = normalString.padStart(14)
  equalsString = equalsString.padStart(14)
  const totalString = total.toString().padStart(7)
  printer.println('')
  if (options.mode === Mode.Yul) {
    if (options.tableText) {
      printer.println('SUMMARY OF SYMBOL TABLE LISTING')
    }
    printer.println('')
    printer.println(equalsString, ' DEFINED BY EQUALS')
    printer.println('')
    printer.println(normalString, ' NORMALLY DEFINED')
    printer.println(line)
    printer.println('')
    printer.println('TOTAL:', totalString)
  } else {
    if (options.tableText) {
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
