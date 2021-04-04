import { compat } from '../common/compat'
import { asciiToEbcdic } from './ebcdic'

export function compareSymbolsEbcdic (str1: string, str2: string): number {
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

export const LINE_LENGTH = 130
const PAGE_BREAK = '-'.repeat(LINE_LENGTH)
const MONTHS = [
  'JANUARY', 'FEBRAURY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
]

export class PrinterContext {
  private readonly header: string
  private pageDirty = false
  private page = 1

  constructor (revision: string, program: string, user: string, part: string) {
    const header = `YUL.JS:  ASSEMBLE REVISION ${revision.toUpperCase()} OF AGC PROGRAM ${program.toUpperCase()} BY ${user.toUpperCase()} ${part}`
    const spacing = ' '.repeat(Math.max(0, 78 - header.length))
    this.header = header + spacing
  }

  println (...data: any[]): void {
    compat.output(...data)
    this.pageDirty = true
  }

  printPageBreak (): void {
    if (this.pageDirty) {
      this.pageDirty = false
      compat.output('')
      compat.output(PAGE_BREAK)
      ++this.page
      this.printHeader()
    }
  }

  printHeader (): void {
    const now = new Date()
    const time = `${now.getHours()}:${now.getMinutes()} ${MONTHS[now.getMonth()]} ${now.getDate()},${now.getFullYear()}`
    const spacing = ' '.repeat(Math.max(0, LINE_LENGTH - 12 - this.header.length - time.length))

    compat.output(this.header, time, spacing, 'PAGE', this.page.toString().padStart(4))
    compat.output('')
  }
}
