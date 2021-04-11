import { argv } from 'process'
import '../../common/node/compat-node'
import assemble, { EolSection, Options } from '../bootstrap'

const options = parseOptions(argv)
if (options !== undefined) {
  assemble(options).then(() => {}, () => {})
}

function parseOptions (argv: string[]): Options | undefined {
  const app = argv.slice(0, 2).join(' ')
  const options: Options = {
    file: '',
    eol: new Set(),
    tableText: true,
    tableColumnHeaders: true,
    formatted: true
  }
  let i = 2

  options.eol.add(EolSection.Cusses)
  options.eol.add(EolSection.Results)

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

  if (options.eol.size === 1) {
    options.tableText = options.tableColumnHeaders = false
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
        for (const section in EolSection) {
          const num = Number(section)
          if (!isNaN(num) && num !== EolSection.OctalCompact) {
            options.eol.add(num)
          }
        }
      } else {
        const section = EolSection[val]
        if (section === undefined) {
          return false
        }
        options.eol.add(section)
      }
      return true
    }

    function removeSection (val: string): boolean {
      if (val === 'All') {
        options.eol.clear()
      } else {
        const section = EolSection[val]
        if (section === undefined) {
          return false
        }
        options.eol.delete(section)
      }
      return true
    }
  }
}

function usage (app: string): void {
  console.error(
`Usage: ${app} [options] <url>
  [-e|--eol <+-><section> [...]]
    Enables (+) or disables (-) a particular end-of-listing section.
    The sections will be printed at most once each, in the order given below.
    The "All" option selects all sections except OctalCompact.
    The default is Cusses and Results.
    The section option must be one of the following.
      All, Listing, Cusses, Symbols, UndefinedSymbols, UnreferencedSymbols,
      CrossReference, TableSummary, MemorySummary, Count, Paragraphs,
      OctalListing, OctalCompact, Occupied, Results
  [-h|--help]
    This help text
  [-u|--unformatted]
    Outputs unformatted data, which is no page breaks or headers, with a single
    column per end-of-listing table.
  `)
}
