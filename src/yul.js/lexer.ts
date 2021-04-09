import { InputStream } from '../common/compat'
import { isWhitespace } from './util'

/**
 * The type of line lexed.
 */
export enum LineType {
  Insertion,
  Remark,
  Pagination,
  Instruction
}

/**
 * Information about the source of the lexed line.
 */
export interface SourceLine {
  source: string
  lineNumber: number
  page: number
  line: string
}

/**
 * The lexed line.
 * Each line has up to three fields (location, operator, and operand) and a remark.
 * If type is Remark, field1 will be undefined if the remark spanned the full line, and an empty string if the remark
 * began in the middle of an otherwise empty line.
 */
export interface LexedLine {
  type: LineType
  sourceLine: SourceLine
  field1?: string
  field2?: string
  field3?: string
  remark?: string
}

/**
 * The yaYUL main source file, which includes all the others.
 * Comments in this file are ignored, while in other files they are preserved as "Remark"s.
 */
const MAIN_SOURCE = '/MAIN.agc'
/**
 * A yaYUL insertion statement.
 */
const INSERTION_EXPR = /^\$(.*)/
/**
 * A yaYUL page comment.
 * The page numbers are returned as Pagination line types, and are preserved upstream for eventual output with the code.
 */
const PAGE_EXPR = /^## Page ([0-9]+)/

/**
 * Emits a LexedLine for each significant line of the specified source.
 * A line is significant if it contains an original remark, a pagination remark, an insertion statement, or code.
 * Non-significant lines are those that are blank or contain a yaYUL comment.
 *
 * An original remark is a comment outside MAIN.agc with a single hash (#).
 * A pagination remark is a line of the form "## Page 123".
 * An insertion statement is a line of the "$file.agc" (anything after the "$" is treated as the file name).
 * Code is any other non-blank non-comment line.
 *
 * Ref yaYUL for the most of the formatting here.
 *
 * @param source the name of the source, returned in each LexedLine
 * @param stream the source as a stream
 * @returns the lines
 */
export async function * lex (source: string, stream: InputStream): AsyncGenerator<LexedLine> {
  const isMainSource = source.endsWith(MAIN_SOURCE)
  let value: string
  let readerDone = false
  let processing = ''
  let start = 0
  let lineNumber = 1
  let page = 0

  while (!readerDone) {
    ({ done: readerDone, value } = await stream.read())
    processing += value

    let eol = 0
    while ((eol = findEol(processing, start)) >= 0) {
      const line = processing.substring(start, eol)
      const result = lexLine(source, isMainSource, lineNumber, page, line)
      start = eol + 1
      if (typeof result === 'number') {
        if (page !== result) {
          page = result
          yield { type: LineType.Pagination, sourceLine: { source, lineNumber, page, line } }
        }
      } else if (result !== undefined) {
        yield result
      }
      ++lineNumber
    }

    processing = processing.substring(start)
    start = 0
  }

  if (processing.length > 0) {
    const result = lexLine(source, isMainSource, lineNumber, page, processing)
    if (typeof result !== 'number' && result !== undefined) {
      yield result
    }
  }
}

function findEol (line: string, start: number): number {
  for (let i = start; i < line.length; i++) {
    if (line[i] === '\r' || line[i] === '\n') {
      return i
    }
  }
  return -1
}

function lexLine (
  source: string, isMainSource: boolean, lineNumber: number, page: number, line: string):
  LexedLine | number | undefined {
  const pageMatch = PAGE_EXPR.exec(line)
  if (pageMatch !== null) {
    return Number.parseInt(pageMatch[1])
  }

  const remarkIndex = line.indexOf('#')
  let remark: string | undefined
  if (remarkIndex >= 0) {
    remark = isMainSource ? undefined : formatRemark(remarkIndex, line)
    line = line.substring(0, remarkIndex)
  }

  const outputLine = line.trimRight()
  const sourceLine = { source, lineNumber, page, line: outputLine }
  if (line.length === 0) {
    return remark === undefined ? undefined : { type: LineType.Remark, sourceLine, remark }
  }

  line = outputLine
  const insert = INSERTION_EXPR.exec(line)
  if (insert !== null) {
    return { type: LineType.Insertion, sourceLine, remark, field1: insert[1] }
  }

  return lexInstruction(sourceLine, remark)
}

function formatRemark (commentStartIndex: number, line: string): string | undefined {
  if (commentStartIndex === 0 && line.length > 1 && line.charAt(1) === '#') {
    // yaYUL comment
    return undefined
  }

  const outputStartIndex = commentStartIndex + 1
  let lastAppend = outputStartIndex
  let output = ''

  for (let i = lastAppend; i < line.length; i++) {
    const c = line.charAt(i)
    if (c === '\t') {
      const spaces = 8 - ((1 + output.length + i - lastAppend) % 8)
      output += line.substring(lastAppend, i)
      output += ' '.repeat(spaces)
      lastAppend = i + 1
    }
  }

  return output + line.substring(lastAppend)
}

function lexInstruction (sourceLine: SourceLine, remark?: string): LexedLine | undefined {
  let column = 0
  let accumulating = ''
  let i = 0
  let tabbing = false
  let fieldNumber = 1
  let field1: string | undefined
  let field2: string | undefined
  let field3: string | undefined

  while (i < sourceLine.line.length) {
    ++column
    if (tabbing && column % 8 === 1) {
      tabbing = false
    }
    let c = tabbing ? ' ' : sourceLine.line.charAt(i++)
    if (c === '\t') {
      tabbing = true
      c = ' '
    }
    if (c === ' ') {
      if (accumulating.length > 0) {
        accumulating += c
      }
    } else {
      accumulating += c
    }
    if (column === 15) {
      field1 = accumulating.length > 0 ? accumulating.trim() : undefined
      accumulating = ''
      ++fieldNumber
    } else if (column === 25 || (column > 16 && isWhitespace(c))) {
      field2 = accumulating.trim()
      accumulating = ''
      accumulating = sourceLine.line.substring(i)
      ++fieldNumber
      break
    }
  }

  if (fieldNumber === 1) {
    if (accumulating.length > 0) {
      field1 = accumulating.trim()
      accumulating = ''
    }
  } else if (fieldNumber === 2) {
    if (accumulating.length > 0) {
      field2 = accumulating.trim()
      accumulating = ''
    }
  } else {
    if (accumulating.length > 0) {
      field3 = accumulating.trim()
    }
  }

  if (field1 === undefined && field2 === undefined && field3 === undefined) {
    return remark === undefined ? undefined : { type: LineType.Remark, sourceLine, field1: '', remark }
  }

  return { type: LineType.Instruction, sourceLine, field1, field2, field3, remark }
}
