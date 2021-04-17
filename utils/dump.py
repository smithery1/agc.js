#!/usr/bin/env python

"""AGC binary file dumper

Outputs AGC binary files in an od like format: 8 columns of 15 bit words.
The parity bit is not output.
"""

import argparse
import os
import re
from pathlib import Path

def output(file):
    with open(file, "rb") as f:
        col = 0
        while (data := f.read(1024)):
            dataLen = len(data)
            for i in range(0, dataLen, 2):
                h = data[i]
                if i == dataLen - 1:
                    l = 0
                else:
                    l = data[i + 1]
                b = h << 7 | l >> 1
                col += 1
                if col == 8:
                    col = 0
                    w = '\n'
                else:
                    w = ' '

                print('%05o' % b, end=w)
    if col > 0:
        print()


if __name__ == "__main__":
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument(
        'file', action = 'extend', nargs = '+',
        metavar = '<AGC binary file>', help = 'the AGC binary file')
    args = arg_parser.parse_args()

    for file in args.file:
        output(file)
