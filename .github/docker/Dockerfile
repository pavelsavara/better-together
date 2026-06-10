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
