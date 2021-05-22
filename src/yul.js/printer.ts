import { compat } from '../common/compat'
import { CharSet } from './charset'
import * as cusses from './cusses'
import { Memory } from './memory'
import { Operations } from './operations'
import { AssemblerEnum, Options, SourceEnum } from './options'

export interface PrintContext {
  printer: Printer
  operations: Operations
  memory: Memory
  options: Options
  charset: CharSet
  cache: Map<string, any>
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
const YUL_MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE',
  'JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
]
const GAP_MONTHS = [
  'JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUNE',
  'JULY', 'AUG.', 'SEP.', 'OCT.', 'NOV.', 'DEC.'
]

export class Printer {
  private readonly header: string
  private readonly formatted: boolean
  private output: (...data: any[]) => void
  private pageDirty = false
  private pageBreak = false
  private separator = false
  private page = 1

  constructor (options: Options, revision: string, program: string, user: string, part: string, formatted: boolean) {
    const assemblerType = AssemblerEnum[options.assembler.assembler()]
    const sourceType = SourceEnum[options.source.source()]
    const assemble = options.assembler.isYul() ? '' : 'ASSEMBLE '
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    const hhmm = options.assembler.isYul() ? '' : `${hours}:${minutes} `
    const months = options.assembler.isYul() ? YUL_MONTHS : GAP_MONTHS
    const space = options.assembler.isYul() ? ' ' : ''
    const time = `${hhmm}${months[now.getMonth()]} ${now.getDate()},${space}${now.getFullYear()}`
    const header = `YUL.JS FOR ${assemblerType}:  ${assemble}REVISION ${revision.toUpperCase()} OF ${sourceType} PROGRAM ${program.toUpperCase()} BY ${user.toUpperCase()} ${part}`
    const spacing = ' '.repeat(Math.max(0, LINE_LENGTH - header.length - time.length - 12))
    this.header = header + spacing + time + '   PAGE'
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
      if (this.pageDirty) {
        this.pageDirty = false
      }
      this.output()
      this.output(PAGE_BREAK)
      this.printHeader()
    } else if (this.separator) {
      this.separator = false
      this.output()
    }
    if (this.formatted || data.length !== 1 || data[0] !== '') {
      this.output(...data)
      this.pageDirty = true
    }
  }

  printLeadingSeparator (): void {
    this.separator = true
  }

  printTrailingSeparator (): void {
    if (this.pageDirty) {
      this.output()
    }
  }

  endPage (nextPage?: number): void {
    if (this.formatted && (this.pageDirty || this.page !== (nextPage ?? this.page))) {
      this.pageBreak = true
      this.separator = false
      if (nextPage !== undefined) {
        this.page = nextPage
      } else if (this.pageDirty) {
        this.page = nextPage ?? this.page + 1
      }
    }
  }

  printHeader (): void {
    if (this.formatted) {
      this.output(this.header, this.page.toString().padStart(4))
      this.output()
    }
  }
}
