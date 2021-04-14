# yul.js: YUL in JavaScript

This sub-project of agc.js is an attempt to write a JavaScript (actually TypeScript) assembler for the Block II Apollo Guidance Computer ("AGC") language that assembles the original mission software perfectly, and other software reasonably.

The original assembler for the AGC software was named YUL[[1]](#1). It provided assembly services and all sorts of information about the assembled software of interest to the programmers. It also generated manufacturing data in various forms and could perform some basic simulation of the hardware for testing software routines, although more sophisticated simulation of the entire mission environment was left to another system.

YUL ran on a [Honeywell 800 Data Processing System](https://en.wikipedia.org/wiki/Honeywell_800) (they sprang for the floating point unit), and later on an upgraded 1800 model. Its input was a large collection of 80-column punch cards representing a mission software program. It assembled these to tape and output various summary listings of the results to a printer. These first of these listings included the original source code in an assembly listing format with the assembled binary word for each line.

YUL was ported by contractors sometime in 1967 to run on the lab's new IBM 360 Model 75[[3]](#3). It was renamed GAP and several enhancements and a few incompatibilities were introduced. This document and the yul.js source code use the generic "YUL" when referencing an AGC assembler. Where a distinction is necessary, either "GAP" is used or the context makes clear that "YUL" references that particular assembler.

The yul.js program is not an emulation of YUL or GAP, nor does it attempt to reproduce their internals or behavior. It simply reads in source in yaYUL format (see below) and writes out assembled binary. For fun, however, it does mimic some of the original YUL and GAP output. It can run in YUL mode or GAP mode (the default). YUL mode is required for some early code bases.

## Input

The Virtual AGC project has digitized all manner of Apollo mission source code in a format compatible with their assembler, named yaYUL[[2]](#2). This is the format accepted by yul.js, which can read those files without modification.

The YUL punch card input was column based, and YUL used column ranges to identify fields. Whitespace was significant, and in theory identifiers could contain spaces, match instruction opcodes, and so on.

For example, the text "CA +2" could represent the operator "CA" with operand "+2", or the legal symbol "CA +2". YUL would distinguish between the two cases based on the text's location on an input card. Fortunately the YUL documentation recommended against most of these practices, and the code itself doesn't seem to use them much.

The yaYUL format uses spaces and eight character tabs to separate and align fields. Comments inserted by the Virtual AGC project begin with two hash characters (##) and continue to the end of the line. These are typically annotations (i.e. page number) and information on the transcription history. Original source code comments (known to YUL as Remarks) begin with a single hash character (#) and continue to the end of the line. Lines beginning with a dollar character ($) contain the name of a file to insert textually at that point in the source. This is used to break the code into reasonable chunks based on the original Log Card information that categorized groups of input cards.

In the spirit of the original YUL, yul.js uses column boundaries to identify fields on code lines.

    0  ... 15 | 16 ...  25 | 26 ...  |
    LOCATION    -OPERATOR*   OPERAND   # COMMENT

The operator field is considered to include the leading compliment (-) and trailing index (\*) characters, if they are provided. The operand field starts no later than column 26, but may start earlier if whitespace is enountered after column 16. This is occasionally necessary for operands in the yaYUL-formatted sources.

The yaYUL comments that identify the original printout page numbers, in the form "## Page 123", are also parsed and kept during the assembly process for output.

## Output

The primary output of yul.js is the assembled binary code.

It also outputs some of the same things that YUL did. This is mostly for amusement, but can be helpful in checking the existing source code and developing new programs.
- An assembly listing with the location and binary code for each line, including error messages with original YUL "Cuss" codes and text
- The symbol table (featuring H-800 and EBCDIC sorting!)
- The undefined symbols, if any
- The unresolved symbols
- Erasable and equals definitions
- A count of the defined symbols
- A summary of memory usage per bank
- Information on the COUNT directives
- Manufacturing hardware information per memory paragraph
- A complete directory of each assembled memory cell
- All occupied memory ranges

## Operation

The primary intent of yul.js is to assemble the original mission software code. However, it does make a fair attempt to check for errors and handle certain valid situations that do not occur in the original source. The hope is to improve this over time though test suites and non-mission code.

## Running

The program current runs under node.js.

1. Download node.js for your OS from [here](https://nodejs.org/en/download/).
1. Install the Typescript compiler

        % npm install -g typescript

1. Download git for your OS from [here](https://git-scm.com/downloads).
1. Clone the agc.js repo into a local directory. For example, run the following.

        % git clone git@github.com:smithery1/agc.js.git

1. Clone the virtualagc repo into a different local directory. For example, run the following.

        % git clone git@github.com:virtualagc/virtualagc.git

1. Compile yul.js.

        % tsc -b agc.js/tsconfig.json

1. Run using node, giving the yaYUL "main" file as an argument.

        % node agc.js/build/yul.js/node/index-node.js virtualagc/Luminary099/MAIN.agc

1. Same assembly, but output all the GAP end-of-listing tables to stdout.

        % node agc.js/build/yul.js/node/index-node.js -e +All virtualagc/Luminary099/MAIN.agc

1. Show command-line options available to control the behavior and output.

        % node agc.js/build/yul.js/node/index-node.js -h

## References
<a id="1">[1]</a>"Apollo Guidance Computer Information Series Issue 13: YUL Programming System", MIT Instrumentation Laboratory, Cambridge, MA, FR-2-113, December, 5, 1963, https://www.ibiblio.org/apollo/Documents/agcis_13_yul.pdf.

<a id="2">[2]</a>R. Burkey, "Programmer's Manual: Block 2 AGC Assembly Language", "General Formatting Information", https://virtualagc.github.io/virtualagc/assembly_language_manual.html#Formatting.

<a id="3">[2]</a>H. Blair-Smith, *Left Brains for the RIght Stuff*, East Bridgewater, MA: SDP Publishing, 2015, 257
