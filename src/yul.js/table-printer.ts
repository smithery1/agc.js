import { compat } from '../common/compat'
import { PrinterContext } from './printer-utils'

export interface TableData<Entry> {
  columns: number
  columnWidth: number
  columnSeparator?: number
  rowsPerPage: number
  rowBreaks?: number
  header?: string
  tableHeader?: string
  entryString: (entry: Entry) => string | undefined
  separator: (entry: Entry, lastEntry: Entry) => boolean
}

export function printTable<Entry> (
  printer: PrinterContext,
  entries: Iterator<Entry>,
  tableData: TableData<Entry>): void {
  let lastEntry: Entry | undefined
  let currentCol = 0
  let currentRow = 0
  let rowBreakCount = 0
  let rowsPerPage = tableData.rowsPerPage
  if (tableData.rowBreaks !== undefined && rowsPerPage % (tableData.rowBreaks + 1) === 0) {
    --rowsPerPage
  }
  const output = new Array<string[]>(rowsPerPage)
  for (let i = 0; i < output.length; i++) {
    output[i] = new Array<string>(tableData.columns)
  }
  const columnSeparator = ' '.repeat(tableData.columnSeparator ?? 0)
  const separator = '='.repeat(tableData.columnWidth) + columnSeparator
  const tableHeader = tableData.tableHeader === undefined
    ? undefined
    : (tableData.tableHeader + columnSeparator + ' ').repeat(tableData.columns)

  for (let next = entries.next(); next.done !== true; next = entries.next()) {
    const entry = next.value
    const entryString = tableData.entryString(entry)

    if (entryString !== undefined) {
      if (lastEntry !== undefined && tableData.separator(entry, lastEntry)) {
        output[currentRow][currentCol] = separator
        incRow()
      }

      lastEntry = entry
      output[currentRow][currentCol] = entryString + columnSeparator
      incRow()
    }
  }

  while (currentRow > 0 || currentCol > 0) {
    output[currentRow][currentCol] = ''
    incRow()
  }

  function incRow (): void {
    if (++currentRow === rowsPerPage) {
      currentRow = 0
      rowBreakCount = 0
      if (++currentCol === tableData.columns) {
        currentCol = 0
        printPage()
      }
    } else {
      ++rowBreakCount
    }

    if (currentRow > 0 && tableData.rowBreaks === rowBreakCount) {
      for (let i = 0; i < tableData.columns; i++) {
        output[currentRow][i] = ''
      }
      incRow()
      rowBreakCount = 0
    }
  }

  function printPage (): void {
    printer.printPageBreak()
    if (tableData.header !== undefined) {
      printer.println(tableData.header)
      printer.println('')
    }
    if (tableHeader !== undefined) {
      printer.println(tableHeader)
      printer.println('')
    }

    output.forEach(row => {
      compat.log(...row)
    })
  }
}
