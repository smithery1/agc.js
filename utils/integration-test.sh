#!/bin/bash -u

#
# Integration and regression testing for yul.js and transcription corrections
# to the AGC sources.
#
# Works with two versions of each code base.
# * main: presumed up to date, unmodified, and correct
# * fork: where changes have been made, presumed ahead of main
#
# Runs an integration/regression test for each of the code bases specified on
# the command line or read from the config file.
# 1. Assembles main and fork with yaYUL to "bin" files
# 2. Runs "dump.py" on the bin files to obtain od-like text files
# 3. Assembles fork with yul.js assember to an "OctalCompact" table and
#    processes this to the same dump.py od-like format
# 4. If a "binsource" file is present in main, santitizes it to the dump.py
#    od-like format. This is done by running oct2bin on it and extracting the
#    relevant lines from the "proof" file.
# 5. Compares the above outputs in the following combinations, noting any
#    differences
#    - yul.js with yaYUL main
#    - yul.js with yaYUL fork
#    - yaYUL fork with yaYUL main
#    - yul.js with binsource
#    - yaYUL main with binsource
#    - yaYUL fork with binsource
#
# The files used for comparison end with ".oct" and are generated into the code
# base's main and fork directories. They are left in place if the comparison
# fails, otherwise they are removed.
#
# The script reads the information it needs for various items from a
# configuration file specified on the command line. The file must contain the
# following lines.
# NODE=<path>      # Path of the node executable
# YULJS=<path>     # Directory of the top level of a yul.js compiled build
# YAYUL=<path>     # Path of the virtualagc yaYUL executable
# OCT2BIN=<path>   # Path of the virtualagc oct2bin executable
# DUMP=<path>      # Path of the yul.js dump.py script
# FORK_REPO=<path> # Directory of the local virtualagc fork repo
# MAIN_REPO=<path> # Directory of the local virtualagc main repo
# TESTS=<list>     # The tests to run, see below
#
# The configured locations should all be given as UNIX paths, but the script
# assumes it's running in a Cygwin environment and node is not, and converts
# paths to DOS as needed.
#
# Each test has the form <code base>[:<yul.js args>[:<yaYUL args>[:<lines>]]].
# * code base: The name of the virtualagc directory with the AGC code.
# * yul.js args: Required for early code bases. E.g. "-y 67".
# * yaYUL args: Required for early code bases. E.g. "--early-sbank".
# lines: Number of significant lines of dump.py output to check. Set to 4096
#        for early code bases to ignore empty superbank 4.
#
# The tests must be declared in the config file as a quoted newline-separated
# list. Blank lines and leading and trailing whitespace is ignored. Example:
# TESTS="
#    Sunburst37:-y 66:--early-sbank --pos-checksums:4096
#    Luminary099
# "
#
# Tests may also be given on the command line (note they may need to be quoted
# for whitespace) as an argument per test, in which case the config file TESTS
# are ignored.
#

function usageAndExit
{
    echo "usage: $1 <config file> [test ...]" 1>&2
    exit 1
}

function runTask
{
    local NUMBER="$1"
    local TOTAL="$2"
    local ASSEMBLER="$3"
    local TYPE="$4"
    local FUNC="$5"
    shift 5

    local ARGS="$2"
    [[ -n "$ARGS" ]] && ARGS=" with args $ARGS"
    echo -n "($NUMBER/$TOTAL) $ASSEMBLER assembing $1$ARGS..."
    $FUNC "$@" > $ERROR_TMP 2>&1
    RESULT=$?
    if (( $RESULT == 0 )) && [[ -t 1 ]]
    then
        tput dl1
    else
        echo FAILED
    fi
    [[ -s $ERROR_TMP ]] && cat $ERROR_TMP
    return $RESULT
}

function compare
{
    local F1="$1"
    local N1="$2"
    local F2="$3"
    local N2="$4"

    if diff -q "$F1" "$F2" > /dev/null
    then
        echo "O: $N1 / $N2 / identical"
        return 0
    else
        echo "X: $N1 / $N2 / differ"
        echo "   $F1"
        echo "   $F2"
        return 1
    fi
}

function compareAll
{
    local YULJS_OUT="$1"
    local YAYUL_MAIN_OUT="$2"
    local YAYUL_FORK_OUT="$3"
    local BINSOURCE_OUT="$4"
    local FAILED=0

    local YS_NAME="yul.js    "
    local YM_NAME="yaYUL main"
    local YF_NAME="yaYUL fork"
    local BS_NAME="binsource "

    compare "$YULJS_OUT" "$YS_NAME" "$YAYUL_FORK_OUT" "$YF_NAME" || FAILED=1
    compare "$YULJS_OUT" "$YS_NAME" "$YAYUL_MAIN_OUT" "$YM_NAME" || FAILED=1
    [[ -n "$BINSOURCE_OUT" ]] && {
        compare "$YULJS_OUT" "$YS_NAME" "$BINSOURCE_OUT" "$BS_NAME" || FAILED=1
    }
    compare "$YAYUL_FORK_OUT" "$YF_NAME" "$YAYUL_MAIN_OUT" "$YM_NAME" || FAILED=1
    if [[ -n "$BINSOURCE_OUT" ]]
    then
        compare "$YAYUL_FORK_OUT" "$YF_NAME" "$BINSOURCE_OUT" "$BS_NAME" || FAILED=1
        compare "$YAYUL_MAIN_OUT" "$YM_NAME" "$BINSOURCE_OUT" "$BS_NAME" || FAILED=1
    fi

    return $FAILED
}

function yulJsAssemble
{
    local DIR="$1"
    local ARGS="$2"
    local OUTPUT="$3"
    local MAIN_PATH=$(cygpath -w "$DIR/MAIN.agc" | sed 's@\\@/@g')

    "$NODE" "$INDEX_PATH" "file:///$MAIN_PATH" $ARGS -u -e -All +OctalCompact \*Results \
        | sed -e 's@^ *[^ ]* @@' -e "s/  @  /00000/g" \
        > "$OUTPUT"
}

function yaYulAssemble
{
    local DIR="$1"
    local ARGS="$2"
    local OUTPUT="$3"
    local LINES="$4"

    pushd $DIR > /dev/null || return 1
    "$YAYUL" $ARGS MAIN.agc > /dev/null || return 1
    popd > /dev/null || return 1
    if [[ -n "$LINES" ]]
    then
        "$DUMP" "$DIR/MAIN.agc.bin" | head "-$LINES" > "$OUTPUT" || return 1
    else
        "$DUMP" "$DIR/MAIN.agc.bin" > "$OUTPUT" || return 1
    fi
    return 0
}

function sanitizeBinsource
{
    local INPUT="$1"
    local OUTPUT="$2"

    pushd /tmp > /dev/null || return 1
    "$OCT2BIN" < "$INPUT" || ( popd > /dev/null; return 1 )
    popd > /dev/null
    egrep '^([0-9]| *@)' /tmp/oct2bin.proof > "$OUTPUT"
}

function testCodeBase
{
    local CODE="$1"
    local YULJS_ARGS="$2"
    local YAYUL_ARGS="$3"
    local LINES="$4"
    local FORK_CODE_DIR="$FORK_REPO/$CODE"
    local FORK_MAIN="$FORK_CODE_DIR/MAIN.agc"
    local MAIN_CODE_DIR="$MAIN_REPO/$CODE"
    local MAIN_MAIN="$MAIN_CODE_DIR/MAIN.agc"
    local YULJS_FORK_OUT="$FORK_CODE_DIR/${CODE}.yul.js.oct"
    local YAYUL_FORK_OUT="$FORK_CODE_DIR/${CODE}.yaYUL.oct"
    local YAYUL_MAIN_OUT="$MAIN_CODE_DIR/${CODE}.yaYUL.oct"
    local BINSOURCE="$MAIN_CODE_DIR/${CODE}.binsource"
    local BINSOURCE_OUT=

    if [[ -f "$BINSOURCE" ]]
    then
        BINSOURCE_OUT=${BINSOURCE}.oct
        sanitizeBinsource "$BINSOURCE" "$BINSOURCE_OUT" || return 1
    fi

    runTask 1 3 yaYUL main yaYulAssemble "$MAIN_CODE_DIR" "$YAYUL_ARGS" "$YAYUL_MAIN_OUT" "$LINES" || return 1
    runTask 2 3 yaYUL fork yaYulAssemble "$FORK_CODE_DIR" "$YAYUL_ARGS" "$YAYUL_FORK_OUT" "$LINES" || return 1
    runTask 3 3 yulJs fork yulJsAssemble "$FORK_CODE_DIR" "$YULJS_ARGS" "$YULJS_FORK_OUT" || return 1

    compareAll "$YULJS_FORK_OUT" "$YAYUL_MAIN_OUT" "$YAYUL_FORK_OUT" "$BINSOURCE_OUT" || return 1
    rm "$YULJS_FORK_OUT" "$YAYUL_MAIN_OUT" "$YAYUL_FORK_OUT"
    [[ -n "$BINSOURCE_OUT" ]] && rm "$BINSOURCE_OUT"
    return 0
}

function runTests
{
    for CODELINE in "$@"
    do
        CODELINE=$(echo $CODELINE | sed -e 's@^ *@@' -e 's@ *$@@')
        IFS=:
        set $CODELINE
        IFS=$ORIG_IFS
        CODE=$1
        YULJS_ARGS=${2:-''}
        YAYUL_ARGS=${3:-''}
        LINES=${4:-''}

        cat << EOF

-----------------------------------------------------------------------------------------------------------------------
$CODELINE
-----------------------------------------------------------------------------------------------------------------------
EOF
        if ! testCodeBase "$CODE" "$YULJS_ARGS" "$YAYUL_ARGS" "$LINES"
        then
            IFS=$NL_IFS
            FAILURES="$FAILURES
    $CODELINE"
            IFS=$ORIG_IFS
        fi
    done
}

(( $# < 1 )) && usageAndExit "$0"
source "$1" || return 1
typeset -r INDEX_PATH=$(cygpath -w "$YULJS/node/index-node.js")
shift

ORIG_IFS=$IFS
NL_IFS="
"
FAILURES=
ERROR_TMP=/tmp/integration-stderr

if (( $# > 0 ))
then
    runTests "$@"
else
    IFS=$NL_IFS
    runTests $TESTS
fi

if [[ -n "$FAILURES" ]]
then
    echo 1>&2
    echo "FAILURES:" 1>&2
    IFS=$NL_IFS
    for FAILURE in $FAILURES
    do
        echo "  $FAILURE" 1>&2
    done
    exit 1
fi

echo
echo "ALL PASSED"
exit 0
