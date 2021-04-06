import { compat } from '../common/compat'
import { PrinterContext } from './printer-utils'

export interface TableData<Entry> {
  columns: number
  columnWidth: number
  columnSeparator?: number
  rowsPerPage: number
  rowBreaks?: number
  pageHeader?: string[]
  pageFooter?: string[]
  tableHeader?: string
  reflowLastPage?: boolean
  entryString: (entry: Entry) => string | undefined
  separator: (entry: Entry, lastEntry: Entry) => boolean
}

export function printTable<Entry> (
  printer: PrinterContext, tableData: TableData<Entry>, entries: Iterator<Entry>): void {
  let lastEntry: Entry | undefined
  let currentCol = 0
  let currentRow = 0
  let rowsPerPage = tableData.rowsPerPage
  if (tableData.rowBreaks !== undefined) {
    rowsPerPage -= Math.floor(rowsPerPage / tableData.rowBreaks)
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

  if (tableData.reflowLastPage ?? true) {
    const lastPageRows = reflowLastPage()
    printPage(lastPageRows)
  } else {
    while (currentRow > 0 || currentCol > 0) {
      output[currentRow][currentCol] = ''
      incRow()
    }
  }

  function incRow (): void {
    if (++currentRow === rowsPerPage) {
      currentRow = 0
      if (++currentCol === tableData.columns) {
        currentCol = 0
        printPage()
      }
    }
  }

  function printPage (rows?: number): void {
    printer.printPageBreak()
    if (tableData.pageHeader !== undefined) {
      tableData.pageHeader.forEach(header => printer.println(header))
      printer.println('')
    }
    if (tableHeader !== undefined) {
      printer.println(tableHeader)
      printer.println('')
    }

    let rowsLeft = rows === undefined ? output.length : rows
    let rowBreakCount = 0
    output.every(row => {
      compat.log(...row)
      if (++rowBreakCount === tableData.rowBreaks) {
        compat.log('')
        rowBreakCount = 0
      }
      return --rowsLeft > 0
    })

    if (tableData.pageFooter !== undefined) {
      printer.println('')
      tableData.pageFooter.forEach(footer => printer.println(footer))
    }
  }

  function reflowLastPage (): number {
    const entries = currentCol * rowsPerPage + currentRow
    const flowRowsPerPage = Math.ceil(entries / tableData.columns)
    const lastFullColumn = (tableData.columns + entries % tableData.columns - 1) % tableData.columns

    let sourceIndex = entries - 1
    let flowColumn = tableData.columns - 1
    while (flowColumn >= 0) {
      let flowRow = flowRowsPerPage - 1
      if (flowColumn > lastFullColumn) {
        output[flowRow--][flowColumn] = ''
      }
      while (flowRow >= 0) {
        const sourceColumn = Math.floor(sourceIndex / rowsPerPage)
        const sourceRow = sourceIndex % rowsPerPage
        output[flowRow][flowColumn] = output[sourceRow][sourceColumn]
        --flowRow
        --sourceIndex
      }
      --flowColumn
    }

    return flowRowsPerPage
  }
}
