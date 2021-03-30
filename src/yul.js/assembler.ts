import { compat } from '../common/compat'
import { isCussInstance } from './cusses'
import { Pass1Assembler } from './pass1'
import { Pass2Assembler } from './pass2'
import { printAssembly, printCuss } from './print-assembly'

export default class Assembler {
  private readonly pass1: Pass1Assembler
  private readonly pass2: Pass2Assembler

  constructor () {
    this.pass1 = new Pass1Assembler()
    this.pass2 = new Pass2Assembler()
  }

  async assemble (mainUrl: string): Promise<boolean> {
    try {
      const pass1Result = await this.pass1.assemble(mainUrl)
      if (isCussInstance(pass1Result)) {
        printCuss(pass1Result)
        return false
      }
      const pass2Result = this.pass2.assemble(pass1Result)
      printAssembly(pass2Result)
      pass2Result.symbolTable.print()
      pass2Result.cells.print()

      return pass2Result.fatalCussCount === 0
    } catch (error) {
      compat.log(error.stack)
      return false
    }
  }
}
