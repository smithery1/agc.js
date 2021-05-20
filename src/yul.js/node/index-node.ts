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
    assembler?: opts.Assembler
    eol: opts.EolSection[]
    formatted: boolean
  } = {
    source: opts.createSource(opts.SourceEnum.AGC),
    eol: [],
    formatted: true
  }
  let i = 2

  while (i < argv.length) {
    const option = argv[i++]
    switch (option) {
      case '-h':
      case '--help':
        usage(app)
        return undefined

      case '-e':
      case '--eol':
        if (!parseEol()) {
          return undefined
        }
        break

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
        if (options.file === undefined) {
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
    options.eol.push(boot.asStderrSection(opts.EolSection.Cusses, true))
    options.eol.push(boot.asStderrSection(opts.EolSection.Results, false))
  }

  if (options.assembler === undefined) {
    options.assembler = opts.createMatchingAssembler(options.source.source())
  }

  const readonlyOptions: opts.Options = {
    file: options.file,
    source: options.source,
    assembler: options.assembler,
    eol: options.eol,
    formatted: options.formatted
  }
  return readonlyOptions

  function parseEol (): boolean {
    let isFirst = true
    while (i < argv.length) {
      const sectionArg = argv[i]
      const enableDisable = sectionArg.length === 0 ? '' : sectionArg.charAt(0)
      if (enableDisable === '-') {
        if (!removeSection(sectionArg.substring(1))) {
          break
        }
      } else if (enableDisable === '+') {
        if (!addSection(sectionArg.substring(1), false)) {
          break
        }
      } else if (enableDisable === '*') {
        if (!addSection(sectionArg.substring(1), true)) {
          break
        }
      } else {
        break
      }
      isFirst = false
      ++i
    }

    if (isFirst) {
      console.error('Missing or invalid eol argument')
    }
    return !isFirst

    function addSection (val: string, isStderr: boolean): boolean {
      if (val === 'All') {
        if (options.source.isAgc() || options.source.isRaytheon()) {
          add(opts.EolSection.ListingWithCusses)
          add(opts.EolSection.Symbols)
          add(opts.EolSection.UndefinedSymbols)
          add(opts.EolSection.UnreferencedSymbols)
          add(opts.EolSection.CrossReference)
          add(opts.EolSection.TableSummary)
          add(opts.EolSection.MemorySummary)
          add(opts.EolSection.Count)
          add(opts.EolSection.Paragraphs)
          add(opts.EolSection.OctalListing)
          add(opts.EolSection.Occupied)
          add(opts.EolSection.Results)
        } else if (options.source.isBlk2()) {
          add(opts.EolSection.ListingWithCusses)
          add(opts.EolSection.Symbols)
          add(opts.EolSection.TableSummary)
          add(opts.EolSection.MemorySummary)
          add(opts.EolSection.Occupied)
          add(opts.EolSection.Paragraphs)
          add(opts.EolSection.OctalListing)
          add(opts.EolSection.Results)
        } else {
          add(opts.EolSection.ListingWithCusses)
          add(opts.EolSection.Symbols)
          add(opts.EolSection.TableSummary)
          add(opts.EolSection.CrossReference)
          add(opts.EolSection.MemorySummary)
          add(opts.EolSection.Occupied)
          add(opts.EolSection.Paragraphs)
          add(opts.EolSection.OctalListing)
          add(opts.EolSection.Results)
        }
      } else {
        const section = opts.EolSection[val]
        if (section === undefined) {
          return false
        }
        add(section)
      }
      return true

      function add (section: opts.EolSection): void {
        options.eol.push(boot.asStderrSection(section, isStderr))
      }
    }

    function removeSection (val: string): boolean {
      if (val === 'All') {
        if (options.source.isYul()) {
          remove(opts.EolSection.ListingWithCusses)
          remove(opts.EolSection.Symbols)
          remove(opts.EolSection.UndefinedSymbols)
          remove(opts.EolSection.UnreferencedSymbols)
          remove(opts.EolSection.CrossReference)
          remove(opts.EolSection.TableSummary)
          remove(opts.EolSection.MemorySummary)
          remove(opts.EolSection.Count)
          remove(opts.EolSection.Paragraphs)
          remove(opts.EolSection.OctalListing)
          remove(opts.EolSection.Occupied)
          remove(opts.EolSection.Results)
        } else {
          remove(opts.EolSection.ListingWithCusses)
          remove(opts.EolSection.Symbols)
          remove(opts.EolSection.TableSummary)
          remove(opts.EolSection.CrossReference)
          remove(opts.EolSection.MemorySummary)
          remove(opts.EolSection.Occupied)
          remove(opts.EolSection.Paragraphs)
          remove(opts.EolSection.OctalListing)
          remove(opts.EolSection.Results)
        }
      } else {
        const section = opts.EolSection[val]
        if (section === undefined) {
          return false
        }
        remove(section)
      }
      return true

      function remove (section: opts.EolSection): void {
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
    return true
  }
}

function usage (app: string): void {
  console.error(
`Usage: ${app} [options] <url>
  [-h|--help]
    This help text
  [-e|--eol <+-><section> [...]]
    Enables (+), disables (-), or enables on stderr (*) a particular end-of-
    listing section. The enabled sections will be printed in the order given on
    the command line. A disable (-) action removes the most recent addition of
    the specified section.
    The "All" option selects all sections output by the actual assembler for
    the current mode (YUL or GAP) in the order they originally appeared.
    If no "-e" option is given, output is Cusses on stderr and Results.
    Each section must be one of the following.
      All, Listing, Cusses, ListingWithCusses,
      Symbols, UndefinedSymbols, UnreferencedSymbols, CrossReference,
      TableSummary, MemorySummary, Count, Paragraphs,
      OctalListing, OctalCompact, Occupied, Results
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
        Early version of some interpretive instruction words
      A1966 Early AGC, suitable for Sunburst37
        Positive bank number based checksums
      A1967 Mid AGC, suitable for Sunburst120
        BANK with an operand updates SBANK
      AGC Suitable for all other versions
        This is the default
  [-a|--assembler <version>]
    Assembles as the specified assembler version.
    If no version is specified, uses one suitable for the source version.
    This primarily affects the end of listing tables and other informational
    output.
    Versions are:
      RAY Raytheon assembler, suitable for SuperJob
        GAP-type EOL output
      Y1965 YUL 1965, suitable for Retread
        EOL output differences vs B1966
      N1966 YUL November 1966, suitable for Aurora12
        EOL output differences vs Y1966
      D1966 YUL December 1966, suitable for Sunburst37 and Solarium055
        EOL output differences vs GAP
      Y1967 YUL 1967, suitable for Sunburst120
        EOL output differences vs GAP
      GAP The GAP port, suitable for all AGC targets
  [-u|--unformatted]
    Outputs unformatted data: no page breaks or headers and a single
    set of columns per end-of-listing table
`)
}
