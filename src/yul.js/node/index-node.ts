import '../../common/node/compat-node'
import assemble from '../bootstrap'

assemble('file:///c:/cygwin64/home/asmith/external/virtualagc/Luminary099/MAIN.agc')
// assemble('file:///c:/cygwin64/home/asmith/external/virtualagc/Luminary099/INTERPRETIVE_CONSTANTS.agc')
  .then(() => {}, () => {})
