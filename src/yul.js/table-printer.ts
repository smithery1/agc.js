import { compat } from '../common/compat'
import { Options } from './bootstrap'
import { PrinterContext } from './printer-utils'

export interface TableData<Entry> {
  columns: number
  columnWidth: number
  columnGap?: number
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
  printer: PrinterContext, tableData: TableData<Entry>, entries: Iterator<Entry>, options: Options): void {
  let lastEntry: Entry | undefined
  let currentCol = 0
  let currentRow = 0
  let rowsPerPage = tableData.rowsPerPage
  const rowBreaks = options.formatted ? tableData.rowBreaks : undefined
  if (rowBreaks !== undefined) {
    rowsPerPage = Math.floor(rowsPerPage * rowBreaks / (1 + rowBreaks))
  }
  const output = new Array<string[]>(rowsPerPage)
  const columns = options.formatted ? tableData.columns : 1
  for (let i = 0; i < output.length; i++) {
    output[i] = new Array<string>(columns)
  }
  const columnSeparator = ' '.repeat(tableData.columnGap ?? 0)
  const separator = '='.repeat(tableData.columnWidth) + columnSeparator
  const tableHeader = tableData.tableHeader === undefined
    ? undefined
    : (tableData.tableHeader + columnSeparator + ' ').repeat(columns)
  let page = 0

  for (let next = entries.next(); next.done !== true; next = entries.next()) {
    const entry = next.value
    const entryString = tableData.entryString(entry)

    if (entryString !== undefined) {
      if (options.formatted && lastEntry !== undefined && tableData.separator(entry, lastEntry)) {
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
    if (lastPageRows > 0) {
      printPage(lastPageRows)
    }
  } else {
    while (currentRow > 0 || currentCol > 0) {
      output[currentRow][currentCol] = ''
      incRow()
    }
  }

  function incRow (): void {
    if (++currentRow === rowsPerPage) {
      currentRow = 0
      if (++currentCol === columns) {
        currentCol = 0
        printPage()
      }
    }
  }

  function printPage (rows?: number): void {
    printer.endPage()
    if (options.formatted || page === 0) {
      if (options.tableText && tableData.pageHeader !== undefined) {
        tableData.pageHeader.forEach(header => printer.println(header))
        printer.println('')
      }
      if (options.tableColumnHeaders && tableHeader !== undefined) {
        printer.println(tableHeader)
        printer.println('')
      }
    }

    let rowsLeft = rows === undefined ? output.length : rows
    let rowBreakCount = 0
    output.every(row => {
      compat.log(...row)
      if (rowsLeft > 1 && ++rowBreakCount === rowBreaks) {
        compat.log('')
        rowBreakCount = 0
      }
      return --rowsLeft > 0
    })

    if (options.formatted && options.tableText && tableData.pageFooter !== undefined) {
      printer.println('')
      tableData.pageFooter.forEach(footer => printer.println(footer))
    }

    ++page
  }

  function reflowLastPage (): number {
    const entries = currentCol * rowsPerPage + currentRow
    const flowRowsPerPage = Math.ceil(entries / columns)
    const lastFullColumn = (columns + entries % columns - 1) % columns

    let sourceIndex = entries - 1
    let flowColumn = columns - 1
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
