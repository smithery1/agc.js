import { argv } from 'process'
import '../../common/node/compat-node'
import * as boot from '../bootstrap'
import * as opts from '../options'

const options = parseOptions(argv)
if (options !== undefined) {
  boot.assemble(options).then(() => {}, () => {})
}

function parseOptions (argv: string[]): opts.Options | undefined {
  const app = argv.slice(0, 2).join(' ')
  const options: {
    file?: string
    source: opts.Source
    assembler: opts.Assembler
    eol: opts.OutputSection[]
    formatted: boolean
  } = {
    source: opts.createSource(opts.SourceEnum.AGC),
    assembler: opts.createMatchingAssembler(opts.SourceEnum.AGC),
    eol: [],
    formatted: true
  }
  let assemblerSet = false
  let i = 2

  while (i < argv.length) {
    const option = argv[i++]
    switch (option) {
      case '-h':
      case '--help':
        usage(app)
        return undefined

      case '-u':
      case '--unformatted':
        options.formatted = false
        break

      case '-s':
      case '--source':
        if (!parseSource()) {
          return undefined
        }
        break

      case '-a':
      case '--assembler':
        if (!parseAssembler()) {
          return undefined
        }
        break

      default:
        if (isOutputSection(option)) {
          if (!parseOutputSection(option)) {
            return undefined
          }
        } else if (options.file === undefined) {
          options.file = option
        } else {
          console.error(`Unknown option '${option}'`)
          return undefined
        }
    }
  }

  if (options.file === undefined) {
    usage(app)
    return undefined
  }

  if (options.eol.length === 0) {
    options.eol.push(boot.asStderrSection(opts.OutputSection.Cusses, true))
    options.eol.push(boot.asStderrSection(opts.OutputSection.Results, false))
  }

  const readonlyOptions: opts.Options = {
    file: options.file,
    source: options.source,
    assembler: options.assembler,
    eol: options.eol,
    formatted: options.formatted
  }
  return readonlyOptions

  function isOutputSection (sectionArg: string): boolean {
    if (sectionArg.length === 0) {
      return false
    }
    const action = sectionArg.charAt(0)
    return action === '-' || action === '+' || action === '*'
  }

  function parseOutputSection (sectionArg: string): boolean {
    const action = sectionArg.charAt(0)
    const section = sectionArg.substring(1)
    let result: boolean
    if (action === '-') {
      result = removeSection(section)
    } else if (action === '+') {
      result = addSection(section, false)
    } else if (action === '*') {
      result = addSection(section, true)
    } else {
      result = false
    }

    if (!result) {
      console.error(`Unknown output section '${section}'`)
    }
    return result

    function addSection (val: string, isStderr: boolean): boolean {
      if (val === 'All') {
        options.assembler.sections().forEach(add)
      } else {
        const section = opts.OutputSection[val]
        if (section === undefined) {
          return false
        }
        add(section)
      }
      return true

      function add (section: opts.OutputSection): void {
        options.eol.push(boot.asStderrSection(section, isStderr))
      }
    }

    function removeSection (val: string): boolean {
      if (val === 'All') {
        options.assembler.sections().forEach(remove)
        remove(opts.OutputSection.Listing)
        remove(opts.OutputSection.Cusses)
      } else {
        const section = opts.OutputSection[val]
        if (section === undefined) {
          return false
        }
        remove(section)
      }
      return true

      function remove (section: opts.OutputSection): void {
        const index1 = options.eol.lastIndexOf(boot.asStderrSection(section, false))
        const index2 = options.eol.lastIndexOf(boot.asStderrSection(section, true))
        const index = Math.max(index1, index2)
        if (index >= 0) {
          options.eol.splice(index, 1)
        }
      }
    }
  }

  function parseSource (): boolean {
    if (i === argv.length) {
      console.error('Missing source argument')
      return false
    }

    const str = argv[i++]
    const source = opts.parseSource(str)
    if (source === undefined) {
      console.error('Invalid source argument')
      return false
    }
    options.source = source

    if (!assemblerSet) {
      options.assembler = opts.createMatchingAssembler(options.source.source())
    }

    return true
  }

  function parseAssembler (): boolean {
    if (i === argv.length) {
      console.error('Missing assembler argument')
      return false
    }

    const str = argv[i++]
    const assembler = opts.parseAssembler(str)
    if (assembler === undefined) {
      console.error('Invalid assembler argument')
      return false
    }
    options.assembler = assembler
    assemblerSet = true
    return true
  }
}

function usage (app: string): void {
  console.error(
`Usage: ${app} [options] <url>

  The <url> must be an absolute URL and typically references a code base's
  MAIN.agc file.

  [-h|--help]
    This help text

  [<+-*><section> [...]]
    Enables (+), disables (-), or enables on stderr (*) a particular output
    section. The enabled sections will be printed in the order given. A disable
    action removes the most recent addition of the specified section.
    The "All" option selects all sections output by the YUL or GAP given by the
    current assembler version in the order they originally appeared.
    If no "-e" option is given, defaults to "-e *Cusses -e +Results".
    Each section must be one of the following.
      All, Listing, Cusses, ListingWithCusses,
      Symbols, UndefinedSymbols, UnreferencedSymbols, CrossReference,
      TableSummary, MemorySummary, Count, Paragraphs,
      OctalListing, OctalCompact, Occupied, Results

  [-u|--unformatted]
    Outputs unformatted data: no page breaks or headers and a single set of
    columns per end-of-listing table

  [-s|--source <version>]
    Assembles for the specified source version.
    Source versions are:
      RAY Raytheon, suitable for SuperJob
        No checksums, EBANK=, or SBANK=; special SETLOC form
        Numeric subfields treated as current-bank addresses
      AGC4 Block 1, suitable for Solarium055
        Substantially simpler instruction set and memory model than Block 2
      B1965 Early BLK2, suitable for Retread
        No checksums
      B1966 Late BLK2, suitable for Aurora12
        Checksums without BNKSUM
        Positive bank number based checksums
        EBANK= doesn't reset on new log, one shot not required
        Early version of some Block 2 interpretive instruction words
      A1966 Early AGC, suitable for Sunburst37
        Positive bank number based checksums
      A1967 Mid AGC, suitable for Sunburst120
        BANK with an operand updates SBANK
      AGC Suitable for all other versions
        This is the default

  [-a|--assembler <version>]
    Assembles as the specified assembler version.
    If no version is specified, uses the one that matches the source version.
    This primarily affects the end-of-listing tables and other informational
    output.
    Versions are:
      RAY Raytheon assembler, suitable for SuperJob
        The Raytheon assembly has no tables, but uses GAP-type EOL output
      Y1965 YUL 1965, suitable for Retread
        EOL output differences vs B1966
      Y1966E YUL 1966 Early, suitable for Aurora12 and Solarium055
        EOL output differences vs Y1966
      Y1966L YUL 1966 Late, suitable for Sunburst37
        EOL output differences vs GAP
      Y1967 YUL 1967, suitable for Sunburst120
        EOL output differences vs GAP
      GAP The GAP port, suitable for AGC`
  )
}
