import { argv } from 'process'
import '../../common/node/compat-node'
import assemble, { asStderrSection, EolSection, Mode, Options } from '../bootstrap'

const options = parseOptions(argv)
if (options !== undefined) {
  assemble(options).then(() => {}, () => {})
}

function parseOptions (argv: string[]): Options | undefined {
  const app = argv.slice(0, 2).join(' ')
  const options: Options = {
    file: '',
    mode: Mode.Gap,
    yulVersion: 0,
    eol: [],
    formatted: true
  }
  let i = 2

  while (i < argv.length) {
    const option = argv[i++]
    switch (option) {
      case '-e':
      case '--eol':
        if (!parseEol()) {
          return undefined
        }
        break

      case '-h':
      case '--help':
        usage(app)
        return undefined

      case '-u':
      case '--unformatted':
        options.formatted = false
        break

      case '-g':
      case '--gap':
        options.mode = Mode.Gap
        break

      case '-y':
      case '--yul':
        options.mode = Mode.Yul
        if (!parseYul()) {
          return undefined
        }
        break

      default:
        if (options.file === '') {
          options.file = option
        } else {
          console.error(`Unknown option '${option}'`)
          return undefined
        }
    }
  }

  if (options.file === '') {
    usage(app)
    return undefined
  }

  if (options.eol.length === 0) {
    options.eol.push(asStderrSection(EolSection.Cusses, true))
    options.eol.push(asStderrSection(EolSection.Results, false))
  }

  return options

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
        add(EolSection.ListingWithCusses)
        add(EolSection.Symbols)
        if (options.mode === Mode.Gap) {
          add(EolSection.UndefinedSymbols)
          add(EolSection.UnreferencedSymbols)
          add(EolSection.CrossReference)
        }
        add(EolSection.TableSummary)
        if (options.mode === Mode.Yul) {
          add(EolSection.CrossReference)
        }
        add(EolSection.MemorySummary)
        if (options.mode === Mode.Gap) {
          add(EolSection.Count)
          add(EolSection.Paragraphs)
          add(EolSection.OctalListing)
        }
        add(EolSection.Occupied)
        if (options.mode === Mode.Yul) {
          add(EolSection.Paragraphs)
          add(EolSection.OctalListing)
        }
        add(EolSection.Results)
      } else {
        const section = EolSection[val]
        if (section === undefined) {
          return false
        }
        add(section)
      }
      return true

      function add (section: EolSection): void {
        options.eol.push(asStderrSection(section, isStderr))
      }
    }

    function removeSection (val: string): boolean {
      if (val === 'All') {
        if (options.mode === Mode.Yul) {
          remove(EolSection.ListingWithCusses)
          remove(EolSection.Symbols)
          remove(EolSection.UndefinedSymbols)
          remove(EolSection.UnreferencedSymbols)
          remove(EolSection.CrossReference)
          remove(EolSection.TableSummary)
          remove(EolSection.MemorySummary)
          remove(EolSection.Count)
          remove(EolSection.Paragraphs)
          remove(EolSection.OctalListing)
          remove(EolSection.Occupied)
          remove(EolSection.Results)
        } else {
          remove(EolSection.ListingWithCusses)
          remove(EolSection.Symbols)
          remove(EolSection.TableSummary)
          remove(EolSection.CrossReference)
          remove(EolSection.MemorySummary)
          remove(EolSection.Occupied)
          remove(EolSection.Paragraphs)
          remove(EolSection.OctalListing)
          remove(EolSection.Results)
        }
      } else {
        const section = EolSection[val]
        if (section === undefined) {
          return false
        }
        remove(section)
      }
      return true

      function remove (section: EolSection): void {
        const index1 = options.eol.lastIndexOf(asStderrSection(section, false))
        const index2 = options.eol.lastIndexOf(asStderrSection(section, true))
        const index = Math.max(index1, index2)
        if (index >= 0) {
          options.eol.splice(index, 1)
        }
      }
    }
  }

  function parseYul (): boolean {
    if (i === argv.length) {
      console.error('Missing yul argument')
      return false
    }

    const version = Number.parseInt(argv[i++], 10)
    if (version === 66 || version === 67) {
      options.yulVersion = version
      return true
    }

    console.error('Invalid yul argument')
    return false
  }
}

function usage (app: string): void {
  console.error(
`Usage: ${app} [options] <url>
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
  [-g|--gap]
    Assembles and outputs using GAP rules. This is the default.
  [-h|--help]
    This help text
  [-u|--unformatted]
    Outputs unformatted data: no page breaks or headers and a single
    set of columns per end-of-listing table
  [-y|--yul <version>]
    Assembles and outputs using YUL rules for the specific YUL version.
    Versions are:
      66 Suitable for Sunburst37. Positive bank number based bugger words.
      67 Suitable for Sunburst120. BANK with an operand updates SBANK.
  `)
}
