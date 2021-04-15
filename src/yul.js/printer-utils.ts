import { compat } from '../common/compat'
import { Options } from './bootstrap'
import { CharSet } from './charset'
import * as cusses from './cusses'
import { SymbolEntry } from './symbol-table'

export interface PrintContext {
  printer: PrinterContext
  options: Options
  charset: CharSet
  sortedSymbolTable?: Array<[string, SymbolEntry]>
}

export function printCuss (instance: cusses.CussInstance): void {
  const formattedSerial = instance.cuss.serial.toString(16).toUpperCase().padStart(2, '0')
  compat.log(formattedSerial, instance.cuss.message)
  if (instance.error !== undefined) {
    compat.log('        ', instance.error.message)
  }
  if (instance.context !== undefined) {
    instance.context.forEach(item => {
      compat.log('        ', item)
    })
  }
}

export const LINE_LENGTH = 120
const PAGE_BREAK = '-'.repeat(LINE_LENGTH)
const MONTHS = [
  'JANUARY', 'FEBRAURY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
]

export class PrinterContext {
  private readonly header: string
  private readonly formatted: boolean
  private output: (...data: any[]) => void
  private pageDirty = false
  private pageBreak = false
  private page = 1

  constructor (revision: string, program: string, user: string, part: string, formatted: boolean) {
    const header = `YUL.JS:  ASSEMBLE REVISION ${revision.toUpperCase()} OF AGC PROGRAM ${program.toUpperCase()} BY ${user.toUpperCase()} ${part}`
    const spacing = ' '.repeat(Math.max(0, 78 - header.length))
    this.header = header + spacing
    this.formatted = formatted
    this.output = compat.output
  }

  stderr (isStderr: boolean): void {
    if (isStderr) {
      this.output = compat.error
    } else {
      this.output = compat.output
    }
  }

  println (...data: any[]): void {
    if (this.pageBreak) {
      this.pageBreak = false
      this.output('')
      this.output(PAGE_BREAK)
      this.printHeader()
    }
    if (this.formatted || data.length !== 1 || data[0] !== '') {
      this.output(...data)
      this.pageDirty = true
    }
  }

  endPage (nextPage?: number): void {
    if (this.formatted && (this.pageDirty || this.page !== (nextPage ?? this.page))) {
      this.pageDirty = false
      this.pageBreak = true
      this.page = nextPage ?? this.page + 1
    }
  }

  printHeader (): void {
    if (this.formatted) {
      const now = new Date()
      const hours = now.getHours().toString().padStart(2, '0')
      const minutes = now.getMinutes().toString().padStart(2, '0')
      const time = `${hours}:${minutes} ${MONTHS[now.getMonth()]} ${now.getDate()},${now.getFullYear()}`
      const occupied = LINE_LENGTH - 12 - this.header.length - time.length
      const spacing = ' '.repeat(Math.max(0, occupied))

      this.output(this.header, time, spacing, 'PAGE', this.page.toString().padStart(4))
      this.output('')
    }
  }
}
