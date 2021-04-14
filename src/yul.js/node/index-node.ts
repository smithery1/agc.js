import { argv } from 'process'
import '../../common/node/compat-node'
import assemble, { EolSection, Mode, Options } from '../bootstrap'

const options = parseOptions(argv)
if (options !== undefined) {
  assemble(options).then(() => {}, () => {})
}

function parseOptions (argv: string[]): Options | undefined {
  const app = argv.slice(0, 2).join(' ')
  const options: Options = {
    file: '',
    mode: Mode.Gap,
    eol: [],
    tableText: true,
    tableColumnHeaders: true,
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

  if (options.eol.length === 1) {
    options.tableText = options.tableColumnHeaders = false
  }

  if (options.eol.length === 0) {
    options.eol.push(EolSection.Cusses)
    options.eol.push(EolSection.Results)
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
        if (!addSection(sectionArg.substring(1))) {
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

    function addSection (val: string): boolean {
      if (val === 'All') {
        options.eol.push(EolSection.ListingWithCusses)
        options.eol.push(EolSection.Symbols)
        if (options.mode === Mode.Gap) {
          options.eol.push(EolSection.UndefinedSymbols)
          options.eol.push(EolSection.UnreferencedSymbols)
          options.eol.push(EolSection.CrossReference)
        }
        options.eol.push(EolSection.TableSummary)
        if (options.mode === Mode.Yul) {
          options.eol.push(EolSection.CrossReference)
        }
        options.eol.push(EolSection.MemorySummary)
        if (options.mode === Mode.Gap) {
          options.eol.push(EolSection.Count)
          options.eol.push(EolSection.Paragraphs)
          options.eol.push(EolSection.OctalListing)
        }
        options.eol.push(EolSection.Occupied)
        if (options.mode === Mode.Yul) {
          options.eol.push(EolSection.Paragraphs)
          options.eol.push(EolSection.OctalListing)
        }
        options.eol.push(EolSection.Results)
      } else {
        const section = EolSection[val]
        if (section === undefined) {
          return false
        }
        options.eol.push(section)
      }
      return true
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
        const index = options.eol.lastIndexOf(section)
        if (index >= 0) {
          options.eol.splice(index, 1)
        }
      }
    }
  }
}

function usage (app: string): void {
  console.error(
`Usage: ${app} [options] <url>
  [-e|--eol <+-><section> [...]]
    Enables (+) or disables (-) a particular end-of-listing section.
    The enabled sections will be printed in the order given on the command
    line. A disable (-) action removes the most recent addition of the
    specified section.
    The "All" option selects all sections output by the actual assembler for
    the current mode (YUL or GAP) in the order they originally appeared.
    If no "-e" option is given, Cusses and Results are output.
    Each section must be one of the following.
      All, Listing, Cusses, OctalCompact,
      ListingWithCusses, Symbols, UndefinedSymbols, UnreferencedSymbols,
      CrossReference, TableSummary, MemorySummary, Count, Paragraphs,
      OctalListing, Occupied, Results
  [-g|--gap]
    Assembles and outputs using GAP rules. This is the default.
  [-h|--help]
    This help text
  [-u|--unformatted]
    Outputs unformatted data: no page breaks or headers with a single
    column per end-of-listing table
  [-y|--yul]
    Assembles and outputs using YUL rules
  `)
}
