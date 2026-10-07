#!/bin/sh
# Regression tests for build.sh: the upload helper and the rm -rf guard.
#
#   sh tests/build-sh.test.sh
#
# Nothing here reaches SourceForge. build.sh upload is run with a fake scp and
# sftp placed first in PATH; they only log their arguments, and the test
# refuses to start if PATH does not resolve scp to the fake one. Needs only a
# POSIX sh and the tools build.sh itself uses (find, sed, sort, du).

here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/lg-test.XXXXXX") || exit 1
trap 'rm -rf "$work"' EXIT INT TERM

pass=0
fail=0
ok()  { pass=$((pass + 1)); printf 'ok   %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL %s\n' "$1"; }
check() { # check <description> <command...>
	_d=$1; shift
	if "$@"; then ok "$_d"; else bad "$_d"; fi
}

# ---- fake scp / sftp ------------------------------------------------------
shim=$work/shim
mkdir -p "$shim"
log=$work/scp.log
cat > "$shim/scp" <<EOF
#!/bin/sh
echo "\$*" >> "$log"
case "\$*" in *FAILME*) echo "scp: simulated failure" >&2; exit 1 ;; esac
exit 0
EOF
printf '#!/bin/sh\nexit 0\n' > "$shim/sftp"
chmod +x "$shim/scp" "$shim/sftp"

if [ "$(PATH=$shim:$PATH command -v scp)" != "$shim/scp" ]; then
	echo "refusing to run: scp does not resolve to the test double" >&2
	exit 2
fi

# ---- a throwaway checkout containing only what build.sh upload needs ------
new_tree() { # new_tree <dir>
	rm -rf "$1"
	mkdir -p "$1"
	cp "$here/build.sh" "$1/"
	cp -r "$here/lib" "$1/"
	: > "$log"
}
run_upload() { # run_upload <dir>: prints build.sh output, returns its exit code
	( cd "$1" && echo tester | PATH=$shim:$PATH sh build.sh upload ) 2>&1
}
zip_at() { # zip_at <dir> <relative path under output/>
	mkdir -p "$(dirname "$1/output/$2")"
	: > "$1/output/$2"
}
calls() { wc -l < "$log" | tr -d ' '; }

# ---- 1. current zip names are found and sent to the right place -----------
t=$work/t1
new_tree "$t"
zip_at "$t" "litegapps/arm64/36/lite/20261006/LiteGapps-lite-arm64-16-20261006-official.zip"
zip_at "$t" "litegapps/arm64/35/core/20261006/LiteGapps-core-arm64-15-20261006-official.zip"
zip_at "$t" "litegapps/arm64/35/core/20261006/notes.txt"
out=$(run_upload "$t"); rc=$?
check "upload exits 0 when every transfer works" test "$rc" -eq 0
check "upload sends every zip, and only zips" test "$(calls)" -eq 2
check "upload keeps the path under the FRS project root" \
	grep -q 'tester@web.sourceforge.net:/home/frs/project/litegapps/litegapps/arm64/36/lite/20261006/LiteGapps-lite-arm64-16-20261006-official.zip' "$log"
check "upload reports the totals" sh -c 'printf "%s" "$1" | grep -q "Uploaded 2 of 2"' _ "$out"

# ---- 2. a file name with a space (status can be a person's name) ----------
t=$work/t2
new_tree "$t"
zip_at "$t" "litegapps/arm64/36/lite/d/LiteGapps-lite-arm64-16-d-John Doe.zip"
run_upload "$t" > /dev/null; rc=$?
check "upload handles a space in the file name" test "$rc" -eq 0 -a "$(calls)" -eq 1

# ---- 3. one failed transfer must fail the whole upload --------------------
t=$work/t3
new_tree "$t"
zip_at "$t" "litegapps/arm64/36/lite/d/LiteGapps-a.zip"
zip_at "$t" "litegapps/arm64/36/lite/d/LiteGapps-FAILME.zip"
zip_at "$t" "litegapps/arm64/36/lite/d/LiteGapps-b.zip"
out=$(run_upload "$t"); rc=$?
check "upload exits non-zero when a transfer fails" test "$rc" -ne 0
check "upload still tries the files after the failed one" test "$(calls)" -eq 3
check "upload says which file failed and how many went through" \
	sh -c 'printf "%s" "$1" | grep -q "upload FAILED" && printf "%s" "$1" | grep -q "Uploaded 2 of 3"' _ "$out"

# ---- 4. nothing to upload is an error, not a silent success ---------------
t=$work/t4
new_tree "$t"
mkdir -p "$t/output"
run_upload "$t" > /dev/null; rc=$?
check "upload exits non-zero when there is no zip" test "$rc" -ne 0
check "upload calls scp zero times when there is no zip" test "$(calls)" -eq 0

# ---- 5. a stray zip outside output/ is never picked up --------------------
t=$work/t5
new_tree "$t"
zip_at "$t" "litegapps/arm64/36/lite/d/LiteGapps-ok.zip"
: > "$t/stray.zip"
run_upload "$t" > /dev/null
check "upload ignores a zip lying in the working directory" test "$(calls)" -eq 1

# ---- 6. static guard: no rm -rf of a $tmp path without the ${tmp:?} guard --
unguarded=$(grep -nE 'rm -rf +"?\$\{?tmp\}?/' "$here"/lib/*.sh "$here/build.sh" | grep -v '\${tmp:?}')
check "no unguarded rm -rf of a \$tmp path" test -z "$unguarded"
[ -z "$unguarded" ] || printf '%s\n' "$unguarded"

# ---- summary ---------------------------------------------------------------
printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
