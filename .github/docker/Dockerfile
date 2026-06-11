# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Better Together — WebAssembly component build toolchain
#
# A single image containing every toolchain needed to build the samples:
#   - ferris  : Rust + wit-bindgen, target wasm32-wasip2
#   - corro   : Rust + cargo-component, target wasm32-wasip1
#   - khaos   : JavaScript + jco / ComponentizeJS (Node.js)
#   - gopher  : Go + TinyGo + wit-bindgen-go
#   - keith   : C++ + wasi-sdk (clang) + wit-bindgen (cpp), target wasm32-wasip2
#   - dusty   : Grain (.gr) -> core wasm, adapted preview1 -> preview2
#
# Plus the shared component tooling:
#   - wasm-tools : inspect / validate components
#   - wkg        : push/pull components to OCI registries
#   - binaryen   : wasm-opt (required by TinyGo's wasip2 backend)
#   - grain      : the Grain compiler (used by dusty)
#   - the WASI preview1 reactor adapter (used by dusty's component new step)
# ---------------------------------------------------------------------------
# trixie (not bookworm) for GLIBC >= 2.39, required by the prebuilt `wkg` binary.
FROM debian:trixie-slim

# Pinned tool versions (see scripts that resolve these from upstream releases).
ARG GO_VERSION=go1.25.11
# Node 24+ is required: jsco's JSPI path uses the WebAssembly.Suspending /
# WebAssembly.promising constructors (the modern JSPI API). Node 22 lacks them
# even with --experimental-wasm-jspi, so jsco silently degrades to a
# non-suspending mode and corrupts resource handles on async WASI imports
# (e.g. filesystem open-at/read), surfacing as "Invalid resource handle: 0".
ARG NODE_VERSION=v24.16.0
ARG TINYGO_VERSION=0.41.1
ARG BINARYEN_VERSION=130
ARG WASM_TOOLS_VERSION=1.251.0
ARG WKG_VERSION=0.15.1
ARG CARGO_COMPONENT_VERSION=0.21.1
# wasi-sdk ships clang + the wasm32-wasip2 sysroot and wasm-component-ld linker.
# The download path embeds the major version (wasi-sdk-NN) and the full version.
ARG WASI_SDK_MAJOR=33
ARG WASI_SDK_VERSION=33.0
# componentize-dotnet (andy/bram) pins its OWN, older wasi-sdk (24.0) via the
# BytecodeAlliance.Componentize.DotNet.WitBindgen MSBuild targets. Those targets
# DownloadFile ~118 MB on every build unless their WasiSdkRoot already exists,
# and then OVERRIDE WASI_SDK_PATH with it — so the wasi-sdk-33 above is ignored
# for the .NET samples. We bake this exact version into the image and point the
# build at it via -p:WasiSdkRoot (see scripts/build-all.sh) to skip that download.
ARG DOTNET_WASI_SDK_MAJOR=24
ARG DOTNET_WASI_SDK_VERSION=24.0
# wit-bindgen CLI provides the C++ (`cpp`) binding generator used by keith.
ARG WIT_BINDGEN_VERSION=0.58.0
# Grain compiler (dusty) — prebuilt standalone linux-x64 binary.
ARG GRAIN_VERSION=0.7.2
# wasmtime ships the WASI preview1 -> preview2 reactor adapter that dusty's
# `wasm-tools component new` step adapts Grain's preview1 imports onto.
ARG WASMTIME_VERSION=v45.0.1

ENV DEBIAN_FRONTEND=noninteractive

# Base OS packages + build prerequisites for `cargo install`.
# libicu is required by the .NET CLI (the SDK host itself is not invariant).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git xz-utils \
        build-essential pkg-config libssl-dev \
        libicu76 \
    && rm -rf /var/lib/apt/lists/*

# --- Go --------------------------------------------------------------------
RUN curl -fsSL "https://go.dev/dl/${GO_VERSION}.linux-amd64.tar.gz" \
        | tar -C /usr/local -xz
ENV PATH="/usr/local/go/bin:/root/go/bin:${PATH}"
# Use only the locally installed Go toolchain (never download another).
ENV GOTOOLCHAIN=local

# --- Node.js ---------------------------------------------------------------
RUN curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" \
        | tar -C /usr/local --strip-components=1 -xJ
# node-*/bin lands in /usr/local/bin (npm, npx, node).

# --- binaryen (wasm-opt) ---------------------------------------------------
RUN curl -fsSL "https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}/binaryen-version_${BINARYEN_VERSION}-x86_64-linux.tar.gz" \
        | tar -C /opt -xz \
    && ln -s "/opt/binaryen-version_${BINARYEN_VERSION}/bin/wasm-opt" /usr/local/bin/wasm-opt

# --- TinyGo ----------------------------------------------------------------
RUN curl -fsSL -o /tmp/tinygo.deb \
        "https://github.com/tinygo-org/tinygo/releases/download/v${TINYGO_VERSION}/tinygo_${TINYGO_VERSION}_amd64.deb" \
    && apt-get update \
    && apt-get install -y --no-install-recommends /tmp/tinygo.deb \
    && rm -f /tmp/tinygo.deb \
    && rm -rf /var/lib/apt/lists/*

# --- wasm-tools ------------------------------------------------------------
RUN curl -fsSL "https://github.com/bytecodealliance/wasm-tools/releases/download/v${WASM_TOOLS_VERSION}/wasm-tools-${WASM_TOOLS_VERSION}-x86_64-linux.tar.gz" \
        | tar -C /tmp -xz \
    && install -m 0755 "/tmp/wasm-tools-${WASM_TOOLS_VERSION}-x86_64-linux/wasm-tools" /usr/local/bin/wasm-tools \
    && rm -rf "/tmp/wasm-tools-${WASM_TOOLS_VERSION}-x86_64-linux"

# --- wkg (wasm-pkg-tools, OCI publishing) ----------------------------------
RUN curl -fsSL -o /usr/local/bin/wkg \
        "https://github.com/bytecodealliance/wasm-pkg-tools/releases/download/v${WKG_VERSION}/wkg-x86_64-unknown-linux-gnu" \
    && chmod 0755 /usr/local/bin/wkg

# --- Rust (stable) + WebAssembly targets -----------------------------------
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH="/usr/local/cargo/bin:${PATH}"
RUN curl -fsSL https://sh.rustup.rs \
        | sh -s -- -y --profile minimal --default-toolchain stable \
    && rustup target add wasm32-wasip1 wasm32-wasip2 \
    && rustup --version && cargo --version

# cargo-component has no prebuilt binary for this version, so build from source.
RUN cargo install --locked "cargo-component@${CARGO_COMPONENT_VERSION}"

# --- wit-bindgen-go --------------------------------------------------------
RUN go install go.bytecodealliance.org/cmd/wit-bindgen-go@latest

# --- wasi-sdk (C/C++ -> wasm32-wasip2) --------------------------------------
RUN curl -fsSL "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_MAJOR}/wasi-sdk-${WASI_SDK_VERSION}-x86_64-linux.tar.gz" \
        | tar -C /opt -xz \
    && ln -s "/opt/wasi-sdk-${WASI_SDK_VERSION}-x86_64-linux" /opt/wasi-sdk
ENV WASI_SDK_PATH=/opt/wasi-sdk

# --- wasi-sdk 24 for componentize-dotnet (andy/bram) ------------------------
# Extracted with --strip-components=1 so the layout (bin/, share/) lands
# directly under <root>/wasi-sdk-24.0 — exactly what the WitBindgen targets
# create themselves, and the path we pass as -p:WasiSdkRoot in build-all.sh.
# Because that path then Exists(), the targets skip their 118 MB download.
RUN mkdir -p "/opt/wasi-sdk-${DOTNET_WASI_SDK_MAJOR}/wasi-sdk-${DOTNET_WASI_SDK_VERSION}" \
    && curl -fsSL "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${DOTNET_WASI_SDK_MAJOR}/wasi-sdk-${DOTNET_WASI_SDK_VERSION}-x86_64-linux.tar.gz" \
        | tar -C "/opt/wasi-sdk-${DOTNET_WASI_SDK_MAJOR}/wasi-sdk-${DOTNET_WASI_SDK_VERSION}" --strip-components=1 -xz

# --- wit-bindgen CLI (cpp generator) ---------------------------------------
RUN curl -fsSL "https://github.com/bytecodealliance/wit-bindgen/releases/download/v${WIT_BINDGEN_VERSION}/wit-bindgen-${WIT_BINDGEN_VERSION}-x86_64-linux.tar.gz" \
        | tar -C /tmp -xz \
    && install -m 0755 "/tmp/wit-bindgen-${WIT_BINDGEN_VERSION}-x86_64-linux/wit-bindgen" /usr/local/bin/wit-bindgen \
    && rm -rf "/tmp/wit-bindgen-${WIT_BINDGEN_VERSION}-x86_64-linux"

# --- Grain compiler (dusty) ------------------------------------------------
# Grain ships a single self-contained linux-x64 binary; no extra runtime needed.
RUN curl -fsSL "https://github.com/grain-lang/grain/releases/download/grain-v${GRAIN_VERSION}/grain-linux-x64" \
        -o /usr/local/bin/grain \
    && chmod 0755 /usr/local/bin/grain \
    && grain --version

# --- WASI preview1 reactor adapter (dusty) ---------------------------------
# Grain emits a core module importing wasi_snapshot_preview1; dusty's
# `wasm-tools component new --adapt` rewrites those onto WASI 0.2 using this
# adapter. build-all.sh reads its path from ${WASI_REACTOR_ADAPTER}.
ENV WASI_REACTOR_ADAPTER=/opt/wasi-adapters/wasi_snapshot_preview1.reactor.wasm
RUN mkdir -p /opt/wasi-adapters \
    && curl -fsSL "https://github.com/bytecodealliance/wasmtime/releases/download/${WASMTIME_VERSION}/wasi_snapshot_preview1.reactor.wasm" \
        -o "${WASI_REACTOR_ADAPTER}"

# --- .NET SDK (componentize-dotnet / NativeAOT-LLVM C# components) ----------
# componentize-dotnet downloads and caches a compatible WASI SDK + LLVM on the
# first build, so no extra native toolchain is needed here beyond the SDK.
# .NET 10 Preview 2 matches componentize-dotnet 0.7.0-preview00010 and its
# pinned NativeAOT-LLVM ilcompiler (10.0.0-alpha.1.25162.1).
ARG DOTNET_VERSION=10.0.100-preview.2.25164.34
ENV DOTNET_ROOT=/usr/local/dotnet \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    PATH="/usr/local/dotnet:/root/.dotnet/tools:${PATH}"
RUN curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --version "${DOTNET_VERSION}" --install-dir "${DOTNET_ROOT}" \
    && rm -f /tmp/dotnet-install.sh \
    && dotnet --version

# ---------------------------------------------------------------------------
# Warm dependency caches
#
# GitHub Actions container jobs mount $HOME (/github/home) as an EMPTY volume at
# runtime, so any cache a tool writes under $HOME is lost. We therefore relocate
# every per-user cache to an absolute /opt path (baked into the image layers)
# and pre-populate it here. CI then reuses these instead of re-downloading and
# re-compiling on every run; only the small leaf crates/projects rebuild.
#
# Keep the versions below in sync with the sample manifests under samples/.
# Drift is non-fatal: a mismatch just falls back to a download at CI time.
# ---------------------------------------------------------------------------
ENV CARGO_TARGET_DIR=/opt/cargo-target \
    NUGET_PACKAGES=/opt/nuget \
    npm_config_cache=/opt/npm-cache \
    GOMODCACHE=/opt/go/pkg/mod \
    GOCACHE=/opt/go-build \
    XDG_CACHE_HOME=/opt/xdg-cache

# Rust: warm the registry + compiled-dependency caches for ferris and corro
# from their REAL manifests and lockfiles (copied from the build context), so
# the exact crate versions CI resolves are already downloaded and the shared
# CARGO_TARGET_DIR holds their compiled dependency artifacts. A synthetic
# combined project would unify versions differently and resolve a different set,
# defeating the cache; using each sample's own Cargo.lock guarantees a match.
# Only the leaf crates recompile in CI. Requires the build context to be the
# repo root (see .github/workflows/build-tools-image.yml).
COPY samples/ferris/Cargo.toml samples/ferris/Cargo.lock /tmp/warm-ferris/
COPY samples/corro/Cargo.toml samples/corro/Cargo.lock /tmp/warm-corro/
RUN <<'SH'
set -eux
# ferris -> wasm32-wasip2. An empty lib still pulls and compiles the full
# dependency graph from the lockfile into CARGO_HOME + CARGO_TARGET_DIR.
mkdir -p /tmp/warm-ferris/src
: > /tmp/warm-ferris/src/lib.rs
cd /tmp/warm-ferris
cargo fetch --locked
cargo build --release --locked --target wasm32-wasip2
# corro -> wasm32-wasip1. cargo-component's metadata is ignored by plain cargo,
# which is fine here: we only need its dependency crate downloaded + compiled.
mkdir -p /tmp/warm-corro/src
: > /tmp/warm-corro/src/lib.rs
cd /tmp/warm-corro
cargo fetch --locked
cargo build --release --locked --target wasm32-wasip1
rm -rf /tmp/warm-ferris /tmp/warm-corro
SH

# .NET: restore the componentize-dotnet toolchain packages (the LLVM ilcompiler
# is large) into NUGET_PACKAGES so andy/bram skip the multi-second cold restore.
RUN <<'SH'
set -eux
mkdir -p /tmp/nugetwarm
cat > /tmp/nugetwarm/nuget.config <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget" value="https://api.nuget.org/v3/index.json" />
    <add key="dotnet-experimental" value="https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet-experimental/nuget/v3/index.json" />
  </packageSources>
</configuration>
XML
cat > /tmp/nugetwarm/warm.csproj <<'XML'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <OutputType>library</OutputType>
    <RuntimeIdentifier>wasi-wasm</RuntimeIdentifier>
    <UseAppHost>false</UseAppHost>
    <SelfContained>true</SelfContained>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="BytecodeAlliance.Componentize.DotNet.Wasm.SDK" Version="0.7.0-preview00010" />
    <PackageReference Include="runtime.linux-x64.Microsoft.DotNet.ILCompiler.LLVM" Version="10.0.0-alpha.1.25162.1" />
  </ItemGroup>
</Project>
XML
cd /tmp/nugetwarm
dotnet restore
rm -rf /tmp/nugetwarm
SH

# JavaScript: prime the npm cache with jco + ComponentizeJS so khaos/reynard's
# `npm install` resolves offline from npm_config_cache.
RUN <<'SH'
set -eux
mkdir -p /tmp/npmwarm
cat > /tmp/npmwarm/package.json <<'JSON'
{
  "name": "npmwarm",
  "private": true,
  "devDependencies": {
    "@bytecodealliance/componentize-js": "^0.18.4",
    "@bytecodealliance/jco": "^1.20.0"
  }
}
JSON
cd /tmp/npmwarm
npm install
rm -rf /tmp/npmwarm
SH

# Go / TinyGo: download go.bytecodealliance.org/cm into GOMODCACHE and compile
# the TinyGo wasip2 runtime/stdlib once (cached under XDG_CACHE_HOME/tinygo) via
# a trivial component, so gopher only recompiles its own package.
RUN <<'SH'
set -eux
mkdir -p /tmp/gowarm/wit
cat > /tmp/gowarm/go.mod <<'GOMOD'
module gowarm

go 1.23.0

require go.bytecodealliance.org/cm v0.3.0
GOMOD
cat > /tmp/gowarm/main.go <<'GO'
package main

import _ "go.bytecodealliance.org/cm"

func main() {}
GO
cat > /tmp/gowarm/wit/warm.wit <<'WIT'
package warm:warm;

world warm {}
WIT
cd /tmp/gowarm
export GOFLAGS=-buildvcs=false
# go get writes the go.sum entries that the tinygo build below requires.
go get go.bytecodealliance.org/cm@v0.3.0
go mod download
# This compiles the TinyGo wasip2 runtime + stdlib into GOCACHE (the slow part
# we want cached). The final component-packaging step may fail for this trivial
# empty world (it lacks the WASI imports the Go runtime references), which is
# fine: the compilation cache is already warm by then.
tinygo build -target=wasip2 --wit-package ./wit --wit-world warm -o /tmp/gowarm/warm.wasm . \
    || echo "warm: tinygo packaging skipped (caches are warm)"
rm -rf /tmp/gowarm
SH

WORKDIR /work

# Sanity banner of all installed tool versions.
RUN echo "=== toolchain ===" \
    && go version \
    && tinygo version \
    && node --version && npm --version \
    && rustc --version && cargo --version \
    && cargo component --version \
    && wit-bindgen-go --version \
    && wit-bindgen --version \
    && "${WASI_SDK_PATH}/bin/clang++" --version \
    && grain --version \
    && wasm-tools --version \
    && wkg --version \
    && wasm-opt --version \
    && test -f "${WASI_REACTOR_ADAPTER}" \
    && dotnet --version

CMD ["bash"]
