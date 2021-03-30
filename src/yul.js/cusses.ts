export interface Cuss {
  readonly serial: number
  readonly fatal: boolean
  readonly message: string
}

function cuss (serial: number, fatal: boolean, message: string): Cuss {
  return { serial, fatal, message }
}

export interface CussInstance {
  cuss: Cuss
  error?: Error
  context?: string[]
}

export class Cusses {
  private readonly instances: CussInstance[]

  constructor () {
    this.instances = []
  }

  add (cuss: Cuss): Cusses
  add (cuss: Cuss, ...context: string[]): Cusses
  add (cuss: Cuss, ...context: string[]): Cusses {
    this.instances.push({ cuss, context })
    return this
  }

  addError (cuss: Cuss, error: Error): Cusses
  addError (cuss: Cuss, error: Error, ...context: string[]): Cusses
  addError (cuss: Cuss, error: Error, ...context: string[]): Cusses {
    this.instances.push({ cuss, error, context })
    return this
  }

  addAll (other?: Cusses): Cusses {
    (other?.instances ?? []).forEach(instance => this.instances.push(instance))
    return this
  }

  cusses (): CussInstance[] {
    return this.instances
  }

  empty (): boolean {
    return this.instances.length === 0
  }
}

export function isCuss (obj: any): obj is Cuss {
  return obj !== undefined && (obj as Cuss).serial !== undefined
}

export function isCussInstance (obj: any): obj is CussInstance {
  return obj !== undefined && (obj as CussInstance).cuss !== undefined
}

export const Cuss01 = cuss(0x02, false, 'Queer information in column 17')
export const Cuss02 = cuss(0x02, false, 'Queer information at end of line')
export const Cuss03 = cuss(0x03, false, 'EBANK/SBANK illegal except with BBCON & 2CADR')
export const Cuss04 = cuss(0x04, false, 'EBANK conflict with one-shot declaration')
// Polish Oocode Problems
// 05 Erased region shou-Ld not cross E-banks
export const Cuss06 = cuss(0x06, true, 'Polish words require blanks in columns 1, 17, & 24')
// 07 x Previous Polish equation noi concluded properly
// 08 x Polish push-up requires negative r^rord. here
export const Cuss09 = cuss(0x09, false, 'Polish address expected here')
export const Cuss0A = cuss(0x0A, true, 'Asterisk illegal on this opcode')
// OB x Interpretive ilstrr:ction not e).pected
// OC x Rt-opcoders mode-in disagrees rnrith mode_out settilg
// 0D x Lft-opcoders mode-in d,isagrees with mode_out setting
export const Cuss0E = cuss(0x0E, false, 'Address has no associated polish opcode')
export const Cuss0F = cuss(0x0F, false, 'Polish address(es) missing prior to this op pair')
// 10 x Location strmbo1 improper on STADBTed store word.
export const Cuss11 = cuss(0x11, true, 'Store opcode must be next after "STADR"')
// 12 x Push-up iI1ega1 before store opcode without TSTADRT!
// 13 Address word.s cross over bad,c or VAC area bor:ndary
export const Cuss14 = cuss(0x14, true, 'Interpretive address word out of sequence')
export const Cuss15 = cuss(0x15, true, 'Address field should contain a Polish operator')
export const Cuss16 = cuss(0x16, true, 'First Polish operator illegally indexed')
export const Cuss17 = cuss(0x17, true, 'Interpreter opcode requires indexed address here')
export const Cuss18 = cuss(0x18, true, 'Interpreter opcode did not call for indexing')
// 79 x Second Polish operator i11ega}1y jldexed
// 1A. x Cal not ha_nd1e neg add.resses u{th inde:cirig here
// Serial Iatal Messase
// Nr:neric Constant Probleus
export const Cuss1B = cuss(0x1B, false, 'More than 14 octal digits in octal constant')
export const Cuss1C = cuss(0x1C, false, 'More than 10 decimal digits in decimal constant')
export const Cuss1D = cuss(0x1D, false, 'Fractional part lost by truncation')
export const Cuss1E = cuss(0x1E, true, 'Range error in constant field')
// IF Inexact decinBl-to-binary conversion
// 20 Double precision constant should not cross banl<s
export const Cuss21 = cuss(0x21, false, 'No "D" in decimal number')
// Merge Control Problers
// 22 x Subroutjle na.rne not recognized
// 23 MuJ-tiple cal-ls in one program or subroutine
// 2l+ x Card ignored because it, rakes memory table too long
// 25 x Card ignored because itrs too late in the deck
export const Cuss26 = cuss(0x26, true, 'Conflict with earlier use of this address')
export const Cuss27 = cuss(0x27, false, 'Card number out of sequence')
// 28 x No natch fourd for second card number
// 29 x First card nuInber not less than second
export const Cuss2A = cuss(0x2A, true, 'No match found for card number or acceptor text')
// . General Address lield Probl_ems
export const Cuss2B = cuss(0x2B, false, 'Blank address field expected')
export const Cuss2C = cuss(0x2C, true, 'Address field is undefined')
export const Cuss2D = cuss(0x2D, true, 'Address field was undefined in pass1')
// 2D x rr ', was undefj:ned il passl
export const Cuss2E = cuss(0x2E, false, 'Address field should be symbolic')
// 2F x 'r ,r was nearly defiled by equals
// 30 x tr ', was nearly defined by equals i:n passl
export const Cuss31 = cuss(0x31, true, 'Address field given multiple definitions')
// 32 x tr
// '1 muJ-tlply defined i:rcluding by equals
// 33 x It tr rrultiply defi-ned ilcludi:ng nearly by =rs
export const Cuss34 = cuss(0x34, true, 'Address given oversize definition')
export const Cuss35 = cuss(0x35, true, 'Address field is associated with conflict')
// 36 x !r ,t associated w'ith multiple errors
export const Cuss37 = cuss(0x37, true, 'Address is associated with wrong memory type')
// 38 x rt rr is in mis ee l-1a:re ous troubl-e
// trl-26
// Seria} Fatal Me s sase
export const Cuss39 = cuss(0x39, true, 'Address is inappropriate for opcode')
export const Cuss3A = cuss(0x3A, true, 'Address is in wrong bank')
export const Cuss3B = cuss(0x3B, true, 'Address depends on unknown location')
// 3C Irregular but acceptable address
export const Cuss3D = cuss(0x3D, true, 'Address field is meaningless')
export const Cuss3E = cuss(0x3E, true, 'Addr. must be basic single-precision constant or inst')
export const Cuss3F = cuss(0x3F, true, 'Range error in value of address')
export const Cuss40 = cuss(0x40, true, 'Indexing is illegal here')
export const Cuss41 = cuss(0x41, true, 'Illegal or mis-spelled operation field')
// l+2 This instruction shoul_d be ildexed
export const Cuss43 = cuss(0x43, true, 'This operation should be extended')
export const Cuss44 = cuss(0x44, true, 'This operation should not be extended')
// Predef i-niti-on Probl_ems
// 45 x rr rr shoul-dntt have been predefi-ned
// l+6 x Attempt t,o predefi-ne l_ocation symbol faiJ_ed
// Location Field Probl_ems
export const Cuss47 = cuss(0x47, false, 'Illegal location field format')
export const Cuss48 = cuss(0x48, false, 'Location field should be blank')
// 49 x Location is i.n wrong tJDe of memory
export const Cuss4A = cuss(0x4A, true, 'Numeric location field is illegal here')
export const Cuss4B = cuss(0x4B, true, 'Oversized or ill-defined location')
export const Cuss4C = cuss(0x4C, true, 'Conflict in use of this location')
// 4n x r|t wonrt fit il symbol table
export const Cuss4E = cuss(0x4E, true, 'No such bank or block number in this machine')
export const Cuss4F = cuss(0x4F, true, 'This bank or block is full')
// Leftover Problems
// 50 x rt " is ild efinably leftover
// 51 x Leftover wontt fit il'memory
// 52 x Tmproper leftover l_ocaiion field format
// Serial- Fatal- Message
// More Cusses
export const Cuss53 = cuss(0x53, false, 'Queer information in column 1')
// 5)+ Address field arithnetic not allowed here
// 55 Address constani not, expected here
export const Cuss56 = cuss(0x56, false, 'Address constant expected here')
// 57 Coi:nt table fuIL. Address field i-gnored,
export const Cuss58 = cuss(0x58, true, 'BBANK type constants require preceding EBANK=')
// 59 One shot SBANK= above was not needed
// 5A Address 0O,O00O (fi11ed in l,-ith address)
// 59 !'STADR'' unnecessar:r
export const Cuss5C = cuss(0x5C, false, 'Assembler finds error but has no specific cuss for it')
// 5D x Address is in super ba.nj< O (filIed jn !-ith bank)
