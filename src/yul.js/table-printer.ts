import { PrintContext } from './printer-utils'

export interface TableData<Entry> {
  leadGap?: number
  columns: number
  columnWidth: number
  columnGap?: number
  rowsPerPage: number
  rowBreaks?: number
  pageHeader?: string[]
  pageFooter?: string[]
  tableHeader?: string
  reflowLastPage?: boolean
  entryString: (context: PrintContext, entry: Entry) => string | undefined
  separator: (context: PrintContext, entry: Entry, lastEntry: Entry) => boolean
}

export function printTable<Entry> (
  context: PrintContext, tableData: TableData<Entry>, entries: Iterator<Entry>): void {
  const printer = context.printer
  const options = context.options
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
  const leadGap = ' '.repeat((tableData.leadGap ?? 1) - 1)
  const fullLeadGap = ' '.repeat(tableData.leadGap ?? 0)
  const columnSeparator = ' '.repeat(tableData.columnGap ?? 0)
  const separator = '='.repeat(tableData.columnWidth) + columnSeparator
  const tableHeader = tableData.tableHeader === undefined
    ? undefined
    : fullLeadGap + (tableData.tableHeader + columnSeparator + ' ').repeat(columns)
  let page = 0

  for (let next = entries.next(); next.done !== true; next = entries.next()) {
    const entry = next.value
    const entryString = tableData.entryString(context, entry)

    if (entryString !== undefined) {
      if (
        options.formatted
        // See Aurora12 p648/649 for an example of YUL not printing a separator as the first entry in a page.
        // See Luminary099 p1563 for an example of GAP doing printing one.
        && (!options.assembler.isYul() || currentCol > 0 || currentRow > 0)
        && lastEntry !== undefined
        && tableData.separator(context, entry, lastEntry)) {
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
    if (currentRow > 0 || currentCol > 0) {
      const maxRow = currentCol === 0 ? currentRow : rowsPerPage
      while (++currentCol < columns) {
        for (let i = 0; i < maxRow; i++) {
          output[i][currentCol] = ''
        }
      }
      printPage(currentRow)
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
      if (options.formatted && tableData.pageHeader !== undefined) {
        tableData.pageHeader.forEach(header => printer.println(header))
        printer.println()
      }
      if (options.formatted && tableHeader !== undefined) {
        printer.println(tableHeader)
        printer.println()
      }
    }

    let rowsLeft = rows === undefined ? output.length : rows
    let rowBreakCount = 0
    output.every(row => {
      if (tableData.leadGap !== undefined) {
        printer.println(leadGap, ...row)
      } else {
        printer.println(...row)
      }
      if (rowsLeft > 1 && ++rowBreakCount === rowBreaks) {
        printer.println()
        rowBreakCount = 0
      }
      return --rowsLeft > 0
    })

    if (options.formatted && tableData.pageFooter !== undefined) {
      printer.println()
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
