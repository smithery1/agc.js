import { compat } from '../common/compat'
import * as addressing from './addressing'
import { asciiToEbcdic } from './ebcdic'
import * as ops from './operations'
import * as parse from './parser'
import { SymbolEntry } from './symbol-table'

interface TableData {
  columnWidth: number
  columnSeparator: number
  header: string
  tableHeader: string
  entryString: (symbol: string, entry: SymbolEntry) => string | undefined
}

const ROWS = 45
const COLS_ALL = 3
const COLS_UNREF = 4

const EQUALS_OP = ops.requireOperation('EQUALS')

export function printSymbolTable (table: Map<string, SymbolEntry>): void {
  const sortedTable = [...table.entries()].sort(ebcdicSort)
  printTable(sortedTable, ROWS, COLS_ALL, ALL_TABLE_DATA)
  printTable(sortedTable, ROWS, COLS_UNREF, UNREF_TABLE_DATA)
}

function ebcdicSort (e1: [string, SymbolEntry], e2: [string, SymbolEntry]): number {
  const str1 = e1[0]
  const str2 = e2[0]
  const length = Math.min(str1.length, str2.length)

  for (let i = 0; i < length; i++) {
    const ebcdic1 = asciiToEbcdic(str1.charCodeAt(i))
    const ebcdic2 = asciiToEbcdic(str2.charCodeAt(i))

    if (ebcdic1 > ebcdic2) {
      return 1
    } else if (ebcdic2 > ebcdic1) {
      return -1
    }
  }

  if (length === str1.length) {
    return length === str2.length ? 0 : -1
  } else {
    return 1
  }
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

function printTable (
  sortedTable: Array<[string, SymbolEntry]>,
  rows: number,
  cols: number,
  tableData: TableData): void {
  let firstChar = ''
  let currentCol = 0
  let currentRow = 0
  const output = new Array<string[]>(rows)
  for (let i = 0; i < output.length; i++) {
    output[i] = new Array<string>(cols)
  }
  const columnSeparator = ' '.repeat(tableData.columnSeparator)
  const separator = '='.repeat(tableData.columnWidth) + columnSeparator
  const tableHeader = (tableData.tableHeader + columnSeparator + ' ').repeat(cols)

  sortedTable.forEach(element => {
    const symbol = element[0]
    const entry = element[1]
    const entryString = tableData.entryString(symbol, entry)

    if (entryString !== undefined) {
      if (symbol.charAt(0) !== firstChar) {
        if (firstChar !== '') {
          output[currentRow][currentCol] = separator
          incEntry()
        }
        firstChar = symbol.charAt(0)
      }

      output[currentRow][currentCol] = entryString + columnSeparator
      incEntry()
    }
  })

  const blank = ' '.repeat(tableData.columnWidth + tableData.columnSeparator)
  while (currentRow > 0 || currentCol > 0) {
    output[currentRow][currentCol] = blank
    incEntry()
  }

  function incEntry (): void {
    if (++currentRow === rows) {
      currentRow = 0
      if (++currentCol === cols) {
        currentCol = 0
        printPage()
      }
    }
  }

  function printPage (): void {
    compat.output('')
    compat.output(tableData.header)
    compat.output('')
    compat.output(tableHeader)
    compat.output('')

    output.forEach(row => {
      compat.log(...row)
    })
  }
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
const ALL_TABLE_DATA: TableData = {
  columnWidth: ALL_COLUMNS.Entry,
  columnSeparator: 0,
  header:
    'SYMBOL TABLE LISTING, INCLUDING DEFINITION, HEALTH, PAGE OF DEF, # OF REFS, PAGE OF FIRST REF, PAGE OF LAST REF.',
  tableHeader:
    'SYMBOL'.padEnd(ALL_COLUMNS.Symbol)
    + ' ' + '  DEF'.padEnd(ALL_COLUMNS.Value)
    + ' ' + 'H'.padStart(ALL_COLUMNS.Health)
    + ' ' + '    REFERENCES'.padEnd(ALL_COLUMNS.AllRefs),
  entryString: allEntryString
}

function allEntryString (symbol: string, entry: SymbolEntry): string | undefined {
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

  const entryString
    = symbol.padEnd(UNREF_COLUMNS.Symbol)
    + ' ' + addressing.asAssemblyString(entry.value).padStart(ALL_COLUMNS.Value)
    + ' ' + health.padStart(ALL_COLUMNS.Health)
    + ' ' + page.toString().padStart(ALL_COLUMNS.Page)
    + ' ' + refsString.padStart(ALL_COLUMNS.Refs)
    + ' ' + (firstRef === Number.MAX_SAFE_INTEGER ? '' : firstRef.toString()).padStart(ALL_COLUMNS.Page)
    + ' ' + (lastRef < 0 ? '' : lastRef.toString()).padStart(ALL_COLUMNS.Page)
  return entryString
}

const UNREF_COLUMNS = {
  Symbol: 8,
  Value: 7,
  Health: 2,
  Page: 4,
  Padding: 5,
  Entry: 8 + 1 + 7 + 1 + 2 + 1 + 4
}
const UNREF_TABLE_DATA: TableData = {
  columnWidth: UNREF_COLUMNS.Entry,
  columnSeparator: 5,
  header: 'UNREFERENCED SYMBOL LISTING, INCLUDING DEFINITION, HEALTH, & PAGE OF DEFINITION.',
  tableHeader:
    'SYMBOL'.padEnd(UNREF_COLUMNS.Symbol)
    + ' ' + '  DEF'.padEnd(UNREF_COLUMNS.Value)
    + ' ' + 'H'.padStart(UNREF_COLUMNS.Health)
    + ' ' + 'PAGE'.padEnd(UNREF_COLUMNS.Page),
  entryString: unrefEntryString
}

function unrefEntryString (symbol: string, entry: SymbolEntry): string | undefined {
  if (entry.references.length === 0) {
    const health = healthString(entry)
    const page = entry.definition.lexedLine.sourceLine.page
    const entryString
      = symbol.padEnd(UNREF_COLUMNS.Symbol)
      + ' ' + addressing.asAssemblyString(entry.value).padStart(UNREF_COLUMNS.Value)
      + ' ' + health.padStart(UNREF_COLUMNS.Health)
      + ' ' + page.toString().padStart(UNREF_COLUMNS.Page)
    return entryString
  }
}
