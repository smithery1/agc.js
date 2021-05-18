#!/usr/bin/env python

"""Renumber yaYUL-formatted AGC source pages

This script walks though a yaYUL-formatted set of source files for one or more
AGC code bases and for each code base ensures that the page numbers in the
comments increase monotonically from 1. It starts with an expected next page
number of 1 and a file of MAIN.agc (or whatever is given on the command line)
and reads source files in the order they are referenced. Each file is rewritten
with updated page numbers to a temporary one with a ".renumber" extention in
the same directory. When the complete input file has been processed, it is
replaced with the temporary file if there were page number changes. Otherwise
the temporary file is deleted.

Each line read from the input is written to the temporary output file. The line
is written unchanged (but see line endings note below) except when a page
renumbering occurs as described below.

If a line starts with a dollar sign ($), it is considered an "insertion" line.
The rest of the line is assumed to reference a file in the same directory as
MAIN.agc, and reading the current file pauses while the insertion file (with
its own temporary file) is read and handled.

If a line starts with "## Page " (any number of spaces or tabs as whitespace),
it is a page numbering. The rest of the line is parsed as an integer and
compared to the next expected page number. If they match, the line is output
unchanged. If they do not match, a note is written to stdout and the line is
output with the correct page number. The next expected page number is increased
by one.

The script outputs with OS-native line endings, which may not be the input line
endings.

The "-n" command line argument specifies a "dry run" that only notes page
number changes and does not write temporary files or replace the input files.
"""

import argparse
import os
import re
from pathlib import Path

INSERT_RE = re.compile(r'\$([^ \t]+)')
PAGE_RE = re.compile(r'##[ \t]*Page[ \t]+([0-9]+)')
nextPage = 1

def dryRun(file):
    input = Path(mainDirectory, file)
    with open(input, "r") as f_read:
        for line in f_read:
            parseLine(line, dryRun)

def renumber(file):
    changes = False
    input = Path(mainDirectory, file)
    output = Path(mainDirectory, file + ".renumber")
    with open(input, "r") as f_read, open(output, "w") as f_write:
        for line in f_read:
            parsed = parseLine(line, renumber)
            if parsed:
                changes = True
                f_write.write(parsed)
            else:
                f_write.write(line)

    if not changes:
        output.unlink()
    else:
        output.rename(input)

def parseLine(line, reader):
    global nextPage
    replaced = False

    insertMatch = INSERT_RE.match(line)
    if insertMatch:
        reader(insertMatch.group(1))
    else:
        pageMatch = PAGE_RE.match(line)
        if pageMatch:
            newPage = int(pageMatch.group(1))
            if newPage != nextPage:
                print('  Renumbering %d to %d' % (newPage, nextPage))
                replaced = '## Page ' + str(nextPage) + '\n'
            nextPage += 1

    return replaced

if __name__ == "__main__":
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument(
        '-n', '--dryrun', action = 'store_true',
        help = 'print results but do not modify files')
    arg_parser.add_argument(
        'main', action = 'extend', nargs = '+',
        metavar = '<main AGC file>', help = 'the MAIN.agc file')
    args = arg_parser.parse_args()

    isDryRun = args.dryrun
    for mainFile in args.main:
        print(mainFile)
        nextPage = 1
        mainPath = Path(mainFile)
        mainDirectory = mainPath.parent
        if args.dryrun:
            dryRun(mainPath.name)
        else:
            renumber(mainPath.name)
