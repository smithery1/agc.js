import * as addressing from './addressing'
import * as ops from './operations'
import * as parse from './parser'
import { compareSymbolsEbcdic, PrinterContext } from './printer-utils'
import { Pass2SymbolTable, SymbolEntry } from './symbol-table'
import { printTable, TableData } from './table-printer'

const EQUALS_OP = ops.requireOperation('EQUALS')
const ERASE_OP = ops.requireOperation('ERASE')

export function printSymbolTable (printer: PrinterContext, symbolTable: Pass2SymbolTable): void {
  const table = symbolTable.getTable()
  const symbolSortedTable = [...table.entries()].sort(ebcdicSort)
  printTable(printer, symbolSortedTable.values(), ALL_TABLE_DATA)
  printer.printPageBreak()
  // TODO: Unassigned data
  printTable(printer, symbolSortedTable.values(), UNREF_TABLE_DATA)
  printer.printPageBreak()
  const valueSortedTable = [...table.entries()].sort(valueSort)
  printTable(printer, valueSortedTable.values(), XREF_TABLE_DATA)
  printer.printPageBreak()
  printSummary(printer, table)
  printer.printPageBreak()
}

function ebcdicSort (e1: [string, SymbolEntry], e2: [string, SymbolEntry]): number {
  return compareSymbolsEbcdic(e1[0], e2[0])
}

function valueSort (e1: [string, SymbolEntry], e2: [string, SymbolEntry]): number {
  const value1 = e1[1].value
  const value2 = e2[1].value

  if (value1 === value2) {
    const page1 = e1[1].definition.lexedLine.sourceLine.page
    const page2 = e2[1].definition.lexedLine.sourceLine.page

    if (page1 === page2) {
      return compareSymbolsEbcdic(e1[0], e2[0])
    }
    return page1 < page2 ? -1 : 1
  }
  return value1 < value2 ? -1 : 1
}

function healthString (entry: SymbolEntry): string {
  if (entry.health === undefined) {
    const card = entry.definition.card
    if (parse.isClerical(card)) {
      if (card.operation.operation === EQUALS_OP) {
        return '='
      }
    }
    return ' '
  } else {
    return entry.health
  }
}

function symbolSeparator (entry: [string, SymbolEntry], lastEntry: [string, SymbolEntry]): boolean {
  return entry[0].charAt(0) !== lastEntry[0].charAt(0)
}

const ALL_COLUMNS = {
  Symbol: 8,
  Value: 7,
  Health: 2,
  Page: 4,
  Refs: 3,
  AllRefs: 4 + 1 + 3 + 1 + 4 + 1 + 4,
  Entry: 8 + 1 + 7 + 1 + 2 + 1 + 4 + 1 + 3 + 1 + 4 + 1 + 4
}

const ALL_TABLE_DATA: TableData<[string, SymbolEntry]> = {
  columns: 3,
  columnWidth: ALL_COLUMNS.Entry,
  rowsPerPage: 45,
  header:
    'SYMBOL TABLE LISTING, INCLUDING DEFINITION, HEALTH, PAGE OF DEF, # OF REFS, PAGE OF FIRST REF, PAGE OF LAST REF.',
  tableHeader:
    'SYMBOL'.padEnd(ALL_COLUMNS.Symbol)
    + ' ' + '  DEF'.padEnd(ALL_COLUMNS.Value)
    + ' ' + 'H'.padStart(ALL_COLUMNS.Health)
    + ' ' + '    REFERENCES'.padEnd(ALL_COLUMNS.AllRefs),
  entryString: allEntryString,
  separator: symbolSeparator
}

function allEntryString (data: [string, SymbolEntry]): string | undefined {
  const symbol = data[0]
  const entry = data[1]
  const health = healthString(entry)
  const page = entry.definition.lexedLine.sourceLine.page
  const references = entry.references.length
  let firstRef = Number.MAX_SAFE_INTEGER
  let lastRef = -1
  entry.references.forEach(ref => {
    const page = ref.lexedLine.sourceLine.page
    if (page < firstRef) {
      firstRef = page
    }
    if (page > lastRef) {
      lastRef = page
    }
  })
  if (lastRef === firstRef) {
    lastRef = -1
  }
  const refsString = references === 0 ? '' : references.toString()

  return symbol.padEnd(UNREF_COLUMNS.Symbol)
    + ' ' + addressing.asAssemblyString(entry.value).padStart(ALL_COLUMNS.Value)
    + ' ' + health.padStart(ALL_COLUMNS.Health)
    + ' ' + page.toString().padStart(ALL_COLUMNS.Page)
    + ' ' + refsString.padStart(ALL_COLUMNS.Refs)
    + ' ' + (firstRef === Number.MAX_SAFE_INTEGER ? '' : firstRef.toString()).padStart(ALL_COLUMNS.Page)
    + ' ' + (lastRef < 0 ? '' : lastRef.toString()).padStart(ALL_COLUMNS.Page)
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
  columnSeparator: UNREF_COLUMNS.Padding,
  rowsPerPage: 45,
  header: 'UNREFERENCED SYMBOL LISTING, INCLUDING DEFINITION, HEALTH, & PAGE OF DEFINITION.',
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

const XREF_TABLE_DATA: TableData<[string, SymbolEntry]> = {
  columns: 5,
  columnWidth: XREF_COLUMNS.Entry,
  columnSeparator: 1,
  rowsPerPage: 45,
  header: 'ERASABLE & EQUALS CROSS-REFERENCE TABLE SHOWING DEFINITION, PAGE OF DEFINITION, AND SYMBOL',
  tableHeader:
  '   DEF'.padEnd(XREF_COLUMNS.Def)
    + ' ' + 'PAGE'.padEnd(XREF_COLUMNS.Page)
    + '  ' + 'SYMBOL'.padEnd(XREF_COLUMNS.Symbol),
  entryString: xrefEntryString,
  separator: () => false
}

function xrefEntryString (data: [string, SymbolEntry]): string | undefined {
  const symbol = data[0]
  const entry = data[1]
  const card = entry.definition.card
  if (parse.isClerical(card) && (card.operation.operation === EQUALS_OP || card.operation.operation === ERASE_OP)) {
    const def = entry.value
    const page = entry.definition.lexedLine.sourceLine.page
    return addressing.asAssemblyString(def).padStart(XREF_COLUMNS.Def)
        + ' ' + page.toString().padStart(XREF_COLUMNS.Page)
        + '  ' + symbol.padEnd(XREF_COLUMNS.Symbol)
  }
}

function printSummary (printer: PrinterContext, table: Map<string, SymbolEntry>): void {
  let normal = 0
  let equals = 0
  table.forEach(entry => {
    const card = entry.definition.card
    if (parse.isClerical(card) && (card.operation.operation === EQUALS_OP)) {
      ++equals
    } else {
      ++normal
    }
  })

  const total = normal + equals
  const normalString = normal.toString()
  const equalsString = equals.toString()
  const len = Math.max(normalString.length, equalsString.length)
  printer.println('')
  printer.println('SUMMARY OF SYMBOL TABLE LISTINGS')
  printer.println('')
  printer.println(normal.toString().padStart(14), ' DEFINED NORMALLY')
  printer.println('')
  printer.println(equals.toString().padStart(14), ' DEFINED BY EQUALS')
  printer.println('-'.repeat(len).padStart(14))
  printer.println('')
  printer.println('TOTAL:', total.toString().padStart(7))
}
