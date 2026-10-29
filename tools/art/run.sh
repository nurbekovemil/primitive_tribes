#!/bin/sh
# Запуск генератора картинок из корня репозитория: tools/art/run.sh people | buildings
set -e
dir=$(dirname "$0")
tmp=$(mktemp -d)
cat "$dir/common.swift" "$dir/$1.swift" > "$tmp/main.swift"
swiftc -O "$tmp/main.swift" -o "$tmp/gen" 2>&1 | grep -v warning || true
"$tmp/gen"
rm -rf "$tmp"
