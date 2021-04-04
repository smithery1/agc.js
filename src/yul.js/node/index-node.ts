import { argv } from 'process'
import '../../common/node/compat-node'
import assemble from '../bootstrap'

const options = optionsStart(argv)
if (options !== argv.length - 1) {
  usage(argv.slice(0, options))
} else {
  assemble(argv[options]).then(() => {}, () => {})
}

function optionsStart (argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].endsWith('index-node.js')) {
      return i + 1
    }
  }

  return argv.length
}

function usage (app: string[]): void {
  console.error(`Usage: ${app.join(' ')} <url>`)
}
