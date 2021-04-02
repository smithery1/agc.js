# agc.js: Apollo Guidance Computer in JavaScript

This project is an attempt to write a JavaScript (actually TypeScript) emulator for the Block II Apollo Guidance Computer ("AGC") that can run the original mission software with a high degree of fidelity.

## Implementation

My purpose here is to learn more about how the AGC worked, and in doing so perhaps contribute to the community of knowledge around it. It's a basic enough machine that a person can understand most of its hardware and software, but complex and important enough to make that effort interesting and worthwhile.
The emulator is written from scratch based entirely on original Apollo-era documentation from the MIT Instrumentation Laboratory ("IL") and some other more recent third-party sources. (See [Bibliography](#bibliography) for the complete list as of this writing.)

## Virtual AGC Project

This work could not exist without the [Virtual AGC][1] project, which has collected, online and freely available, almost all the available information about the AGC and related machines. The IL documentation I use comes from their scans, and the original AGC source and binary code in machine-readable form is from them as well.

That said, I do not use the Virtual AGC's assembler or emulator code and have not even looked at it. My goal is to learn by doing and struggling, and copying someone else's complete and tested solution does not meet that goal.

## Road Map

The first step is to write an assembler that can translate the source code ([example][2]) into AGC binary code. This is not strictly necessary for an emulator, since the corresponding [binary code][3] is also available, but it's a good way to become familiar with the source code and to support custom programs and debugging in the future. Validation of this step is that the output binary code matches the original for all available source code. Since this does not provide any negative testing, further validation is given by a suite of test cases that covers both paradigms that are used in the original source and ones that are not.

The second step is to write the emulator without regard to external interfaces. Emulation via the pulse codes is an interesting option that would provide some insight into normally hidden areas of the logic units. Validation here is by running parts of the original software, original self-check code, a test suite of new custom self-check code, and potentially other means.

The third step is to provide integration with software debugging tools to be able to inspect, observe, and modify the memory and software as it runs.

The fourth step is to implement some external interfaces. The obvious one to start with is the DSKY.

The fifth step is to make previous steps available to use via a web browser with an appropriate UI.

Subsequent steps can implement further external interfaces and tie them into the UI.

## Current State

Step one is in progress. The assembler "yul.js" produces correct binary output for the [Luminary 099 source][2]. Next is to clean up the yul.js source and comments, add other YUL-like output for fun, test against other mission software, and write the test suite. See the [yul.js README][4] for more information on the assembler and how it works.

[1]: https://virtualagc.github.io/virtualagc/index.html
[2]: https://github.com/virtualagc/virtualagc/tree/master/Luminary099
[3]: https://github.com/virtualagc/virtualagc/blob/master/Luminary099/Luminary099.binsource
[4]: https://github.com/smithery1/agc.js/tree/main/src/yul.js

## Bibliography {#bibliography}

B\. Savage and A. Drake, "ACCG4 Basic Training Manual", MIT Instrumentation Laboratory, Cambridge, MA, E-2052, January 1967, http://www.ibiblio.org/apollo/NARA-SW/E-2052.pdf.

H\. Blair-Smith, "AGC4 MEMO # 9 - Block II Instructions", MIT Instrumentation Laboratory, Cambridge, MA, Revised July 1, 1966, https://www.ibiblio.org/apollo/hrst/archive/1689.pdf.

"Apollo Guidance Program Symbolic Listing Information for Block 2", MIT Instrumentation Laboratory, Cambridge, MA, NAS 9-8166, November 20, 1969, https://www.ibiblio.org/apollo/Documents/SymbolicListingInformation.pdf.

"Apollo Guidance Computer Information Series Issue 13: YUL Programming System", MIT Instrumentation Laboratory, Cambridge, MA, FR-2-113, December, 5, 1963, https://www.ibiblio.org/apollo/Documents/agcis_13_yul.pdf.

F\. O'Brien, *The Apollo Guidance Computer: Architecture and Operation", Chichester, UK: Praxis Publishing Ltd., 2010.

R\. Burkey, "Programmer's Manual: Block 2 AGC Assembly Language", "General Formatting Information", https://virtualagc.github.io/virtualagc/assembly_language_manual.html#Formatting.
