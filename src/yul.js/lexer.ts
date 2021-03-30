import { InputStream } from '../common/compat'
import { isWhitespace } from './util'

/**
 * Lexer module.
 *
 * References
 * 1. "Apollo Guidance Computer Information Series Issue 13: YUL Programming System",
 *    FR-2-113, https://www.ibiblio.org/apollo/Documents/agcis_13_yul.pdf
 * 2. "Apollo Guidance Program Symbolic Listing Information for Block 2", NAS 9-8166,
 *    https://www.ibiblio.org/apollo/Documents/SymbolicListingInformation.pdf
 * 3. Ron Burkey, "Programmer's Manual: Block 2 AGC Assembly Language", "General Formatting Information"
 *    https://virtualagc.github.io/virtualagc/assembly_language_manual.html#Formatting
 *
 * Since the original YUL read card inputs, it did not need to lex words per se and used column ranges to read fields.
 * In that spirit, this lexer defines fields by column ranges as well, with some caveats to match the yaYUL input.
 * Lexing with only whitespace to separate fields introduces certain ambiguities that, while of limited practical
 * impact, would not necessarily have been an issue for YUL.
 * For example, YUL discouraged but did not prevent things like embedded spaces in symbols and defining symbols that
 * match instruction codes.
 *
 * Per (3), yaYUL strips columns 1-8, and empirically has a 16 character location field and generally aligns fields with
 * 8-column tabs or equivalent spaces.
 *
 * (1) 13-114 specifies the ability to provide an absolute address in the location and address fields, but since no
 * examples appear in the AGC code, it is not supported here at this time.
 *
 * An offset is allowed in the location field.
 * It is ignored per (1) 13-114, and is not validated for correctness beyond basic syntax.
 * (yaYUL requires optional leading spaces for the offset, but per (1) 13-114 this seems to have been allowed by not
 * required by YUL since a symbolic subfield is defined as non-numeric.
 * We allow but do not require leading spaces.)
 *
 * Extra text beyond the rightmost token is captured and warned, although the original YUL
 * probably didn't do this.
*/

export enum LineType {
  Insertion,
  Remark,
  Pagination,
  Instruction
}

export interface SourceLine {
  source: string
  lineNumber: number
  page: number
  line: string
}

export interface LexedLine {
  type: LineType
  sourceLine: SourceLine
  field1?: string
  field2?: string
  field3?: string
  remark?: string
}

const MAIN_SOURCE = '/MAIN.agc'
const PAGE_EXPR = /^## Page ([0-9]+)/

/**
 * A yaYUL insertion statement.
 *
 * Ref 3
 */
const INSERTION_EXPR = /^\$(.*)/

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
        page = result
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
  let field1: string | undefined
  let field2: string | undefined

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
    } else if (column === 25 || (column > 16 && isWhitespace(c))) {
      field2 = accumulating.trim()
      accumulating = ''
      accumulating = sourceLine.line.substring(i)
      break
    }
  }

  if (field2 === undefined) {
    if (accumulating.length > 0) {
      field2 = accumulating.trim()
      accumulating = ''
    } else if (field1 === undefined) {
      return remark === undefined ? undefined : { type: LineType.Remark, sourceLine, field1: '', remark }
    } else {
      return { type: LineType.Instruction, sourceLine, field1, field2, remark }
    }
  }

  const field3 = accumulating.length > 0 ? accumulating.trim() : undefined
  return { type: LineType.Instruction, sourceLine, field1, field2, field3, remark }
}
