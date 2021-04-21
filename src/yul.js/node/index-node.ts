import { argv } from 'process'
import '../../common/node/compat-node'
import assemble, * as boot from '../bootstrap'

const options = parseOptions(argv)
if (options !== undefined) {
  assemble(options).then(() => {}, () => {})
}

function parseOptions (argv: string[]): boot.Options | undefined {
  const app = argv.slice(0, 2).join(' ')
  const options: boot.Options = {
    file: '',
    yulVersion: boot.YulVersion.GAP,
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

      case '-y':
      case '--yul':
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
    options.eol.push(boot.asStderrSection(boot.EolSection.Cusses, true))
    options.eol.push(boot.asStderrSection(boot.EolSection.Results, false))
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
        add(boot.EolSection.ListingWithCusses)
        add(boot.EolSection.Symbols)
        if (boot.isGap(options.yulVersion)) {
          add(boot.EolSection.UndefinedSymbols)
          add(boot.EolSection.UnreferencedSymbols)
          add(boot.EolSection.CrossReference)
        }
        add(boot.EolSection.TableSummary)
        if (boot.isYul(options.yulVersion) && options.yulVersion > boot.YulVersion.BLK2) {
          add(boot.EolSection.CrossReference)
        }
        add(boot.EolSection.MemorySummary)
        if (boot.isGap(options.yulVersion)) {
          add(boot.EolSection.Count)
          add(boot.EolSection.Paragraphs)
          add(boot.EolSection.OctalListing)
        }
        add(boot.EolSection.Occupied)
        if (boot.isYul(options.yulVersion)) {
          add(boot.EolSection.Paragraphs)
          add(boot.EolSection.OctalListing)
        }
        add(boot.EolSection.Results)
      } else {
        const section = boot.EolSection[val]
        if (section === undefined) {
          return false
        }
        add(section)
      }
      return true

      function add (section: boot.EolSection): void {
        options.eol.push(boot.asStderrSection(section, isStderr))
      }
    }

    function removeSection (val: string): boolean {
      if (val === 'All') {
        if (boot.isYul(options.yulVersion)) {
          remove(boot.EolSection.ListingWithCusses)
          remove(boot.EolSection.Symbols)
          remove(boot.EolSection.UndefinedSymbols)
          remove(boot.EolSection.UnreferencedSymbols)
          remove(boot.EolSection.CrossReference)
          remove(boot.EolSection.TableSummary)
          remove(boot.EolSection.MemorySummary)
          remove(boot.EolSection.Count)
          remove(boot.EolSection.Paragraphs)
          remove(boot.EolSection.OctalListing)
          remove(boot.EolSection.Occupied)
          remove(boot.EolSection.Results)
        } else {
          remove(boot.EolSection.ListingWithCusses)
          remove(boot.EolSection.Symbols)
          remove(boot.EolSection.TableSummary)
          remove(boot.EolSection.CrossReference)
          remove(boot.EolSection.MemorySummary)
          remove(boot.EolSection.Occupied)
          remove(boot.EolSection.Paragraphs)
          remove(boot.EolSection.OctalListing)
          remove(boot.EolSection.Results)
        }
      } else {
        const section = boot.EolSection[val]
        if (section === undefined) {
          return false
        }
        remove(section)
      }
      return true

      function remove (section: boot.EolSection): void {
        const index1 = options.eol.lastIndexOf(boot.asStderrSection(section, false))
        const index2 = options.eol.lastIndexOf(boot.asStderrSection(section, true))
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

    const version = boot.YulVersion[argv[i++]]
    if (version === undefined) {
      console.error('Invalid yul argument')
      return false
    }
    options.yulVersion = version
    return true
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
  [-h|--help]
    This help text
  [-u|--unformatted]
    Outputs unformatted data: no page breaks or headers and a single
    set of columns per end-of-listing table
  [-y|--yul <version>]
    Assembles and outputs using YUL rules for the specific YUL version.
    Versions are:
      BLK2  Suitable for Agora12.
      Y1966 Suitable for Sunburst37. Positive bank number based bugger words.
      Y1967 Suitable for Sunburst120. BANK with an operand updates SBANK.
      GAP   Suitable for all other versions. This is the default.
  `)
}
