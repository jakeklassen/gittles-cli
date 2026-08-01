#!/bin/sh
# Install the native gittles CLI.
#
#   curl -fsSL https://raw.githubusercontent.com/jakeklassen/gittles-cli/main/install.sh | sh
#
# Environment:
#   GITTLES_INSTALL_DIR   where to install (default: ~/.local/bin)
#   GITTLES_VERSION       version to install, e.g. 0.2.0 (default: latest)
#   GITTLES_TAG           exact release tag, when it is not v$GITTLES_VERSION
#   GITTLES_REPO          release repo (default: jakeklassen/gittles-cli)
#   GITTLES_ASSET         asset name override; normally derived from your platform
#   GITTLES_VERIFY_ATTESTATION=1
#                         also verify sigstore build provenance (requires the gh CLI)
#
# Everything is wrapped in main() and only invoked on the last line, so a truncated
# download cannot execute a partial script.

set -eu

REPO="${GITTLES_REPO:-jakeklassen/gittles-cli}"
INSTALL_DIR="${GITTLES_INSTALL_DIR:-${HOME}/.local/bin}"
VERSION="${GITTLES_VERSION:-latest}"

BOLD=''
DIM=''
RED=''
GREEN=''
RESET=''
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
	BOLD=$(printf '\033[1m')
	DIM=$(printf '\033[2m')
	RED=$(printf '\033[31m')
	GREEN=$(printf '\033[32m')
	RESET=$(printf '\033[0m')
fi

say() {
	printf '%s\n' "$*"
}

die() {
	printf '%sinstall failed:%s %s\n' "$RED" "$RESET" "$*" >&2
	exit 1
}

need() {
	command -v "$1" >/dev/null 2>&1 || die "$1 is required but not installed"
}

detect_asset() {
	if [ -n "${GITTLES_ASSET:-}" ]; then
		printf '%s' "$GITTLES_ASSET"
		return
	fi

	# Asset names use Node's platform/arch spelling, matching assetNameFor() in
	# update.ts, so the installer and the self-updater agree.
	os=$(uname -s)
	case "$os" in
	Linux) platform=linux ;;
	Darwin) platform=darwin ;;
	MINGW* | MSYS* | CYGWIN*)
		die "Windows is not supported yet — scriptc's Windows port has no socket stack"
		;;
	*) die "unsupported operating system: $os" ;;
	esac

	machine=$(uname -m)
	case "$machine" in
	x86_64 | amd64) cpu=x64 ;;
	arm64 | aarch64) cpu=arm64 ;;
	*) die "unsupported architecture: $machine" ;;
	esac

	printf 'gittles-%s-%s' "$platform" "$cpu"
}

sha256_of() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | cut -d' ' -f1
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | cut -d' ' -f1
	else
		die "no sha256sum or shasum available to verify the download"
	fi
}

main() {
	need curl
	need uname

	asset=$(detect_asset)

	if [ -n "${GITTLES_TAG:-}" ]; then
		base="https://github.com/${REPO}/releases/download/${GITTLES_TAG}"
	elif [ "$VERSION" = latest ]; then
		base="https://github.com/${REPO}/releases/latest/download"
	else
		base="https://github.com/${REPO}/releases/download/v${VERSION}"
	fi

	tmp=$(mktemp -d)
	trap 'rm -rf "$tmp"' EXIT INT TERM

	say "${BOLD}gittles${RESET} ${DIM}installer${RESET}"
	say "  repo    ${REPO}"
	say "  version ${VERSION}"
	say "  asset   ${asset}"
	say "  target  ${INSTALL_DIR}/gittles"
	say ''

	printf '  downloading… '
	curl -fsSL "${base}/${asset}" -o "${tmp}/gittles" ||
		die "could not download ${base}/${asset} (has a release been published?)"
	say 'done'

	printf '  verifying checksum… '
	curl -fsSL "${base}/checksums.txt" -o "${tmp}/checksums.txt" ||
		die 'release has no checksums.txt — refusing to install'

	expected=$(grep " \*\{0,1\}${asset}\$" "${tmp}/checksums.txt" | cut -d' ' -f1 | head -1)
	[ -n "$expected" ] || die "no checksum published for ${asset} — refusing to install"

	actual=$(sha256_of "${tmp}/gittles")
	[ "$expected" = "$actual" ] || die "checksum mismatch (expected ${expected}, got ${actual})"
	say 'ok'

	if [ "${GITTLES_VERIFY_ATTESTATION:-}" = 1 ]; then
		printf '  verifying build provenance… '
		command -v gh >/dev/null 2>&1 ||
			die 'GITTLES_VERIFY_ATTESTATION=1 but the gh CLI is not installed'
		gh attestation verify "${tmp}/gittles" --repo "$REPO" >/dev/null 2>&1 ||
			die 'build provenance could not be verified — refusing to install'
		say 'ok'
	fi

	mkdir -p "$INSTALL_DIR" || die "could not create ${INSTALL_DIR}"
	chmod 755 "${tmp}/gittles"
	mv -f "${tmp}/gittles" "${INSTALL_DIR}/gittles" ||
		die "could not write to ${INSTALL_DIR} — set GITTLES_INSTALL_DIR to somewhere writable"

	installed=$("${INSTALL_DIR}/gittles" version 2>/dev/null || printf 'unknown')
	say ''
	say "  ${GREEN}installed${RESET} gittles ${installed} to ${INSTALL_DIR}/gittles"

	case ":${PATH}:" in
	*":${INSTALL_DIR}:"*)
		say "  run ${BOLD}gittles${RESET} to get started"
		;;
	*)
		say ''
		say "  ${INSTALL_DIR} is not on your PATH. Add it:"
		say "    ${DIM}echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.zshrc${RESET}"
		;;
	esac
}

main "$@"
