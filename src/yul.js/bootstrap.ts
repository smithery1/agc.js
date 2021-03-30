import Assembler from './assembler'

export default async function assemble (mainUrl: string): Promise<boolean> {
  const assember = new Assembler()
  const result = await assember.assemble(mainUrl)
  return result
}
