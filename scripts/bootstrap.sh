#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ]; then echo 'The Portal supports macOS only.' >&2; exit 1; fi
if ! xcode-select -p >/dev/null 2>&1; then
  echo 'First install Apple Command Line Tools: xcode-select --install'
  echo 'After the installation finishes, run this command again.'; exit 1
fi
version=v24.22.2
case "$(uname -m)" in
  arm64) arch=arm64; expected=aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a ;;
  x86_64) arch=x64; expected=d5e336d588c45be0c37dbd52cc29895593009ca4997a77a1fd02815131ed0e52 ;;
  *) echo 'Unsupported Mac architecture.' >&2; exit 1 ;;
esac
mkdir -p runtime
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [ ! -x runtime/node ] || [ "$(runtime/node --version)" != "$version" ]; then
  archive="node-$version-darwin-$arch.tar.gz"
  curl --fail --location --proto '=https' --tlsv1.2 --retry 3 "https://nodejs.org/dist/$version/$archive" -o "$tmp/$archive"
  actual=$(shasum -a 256 "$tmp/$archive" | awk '{print $1}')
  if [ "$actual" != "$expected" ]; then echo 'Node checksum mismatch. Nothing was installed.' >&2; exit 1; fi
  tar -xzf "$tmp/$archive" -C "$tmp"
  cp "$tmp/node-$version-darwin-$arch/bin/node" runtime/node.new
  chmod 755 runtime/node.new
  mv runtime/node.new runtime/node
  cp "$tmp/node-$version-darwin-$arch/LICENSE" runtime/NODE-LICENSE
fi
echo 'Building the macOS credential helper…'
# Compile with a private cache, so setup works from a normal writable checkout.
mkdir -p runtime/module-cache
xcrun swiftc -module-cache-path runtime/module-cache -O native/Keychain.swift -o "$tmp/portal-keychain" -framework Security
codesign --force --sign - --identifier org.theportal.keychain "$tmp/portal-keychain"
cp "$tmp/portal-keychain" runtime/portal-keychain.new
chmod 755 runtime/portal-keychain.new
mv runtime/portal-keychain.new runtime/portal-keychain
echo 'Runtime ready. No Google account or room service has been changed.'
