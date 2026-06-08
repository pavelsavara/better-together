# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Better Together — WebAssembly component build toolchain
#
# A single image containing every toolchain needed to build the four samples:
#   - ferris  : Rust + wit-bindgen, target wasm32-wasip2
#   - corro   : Rust + cargo-component, target wasm32-wasip1
#   - khaos   : JavaScript + jco / ComponentizeJS (Node.js)
#   - gopher  : Go + TinyGo + wit-bindgen-go
#
# Plus the shared component tooling:
#   - wasm-tools : inspect / validate components
#   - wkg        : push/pull components to OCI registries
#   - binaryen   : wasm-opt (required by TinyGo's wasip2 backend)
# ---------------------------------------------------------------------------
# trixie (not bookworm) for GLIBC >= 2.39, required by the prebuilt `wkg` binary.
FROM debian:trixie-slim

# Pinned tool versions (see scripts that resolve these from upstream releases).
ARG GO_VERSION=go1.25.11
ARG NODE_VERSION=v22.22.3
ARG TINYGO_VERSION=0.41.1
ARG BINARYEN_VERSION=130
ARG WASM_TOOLS_VERSION=1.251.0
ARG WKG_VERSION=0.15.1
ARG CARGO_COMPONENT_VERSION=0.21.1

ENV DEBIAN_FRONTEND=noninteractive

# Base OS packages + build prerequisites for `cargo install`.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git xz-utils \
        build-essential pkg-config libssl-dev \
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

WORKDIR /work

# Sanity banner of all installed tool versions.
RUN echo "=== toolchain ===" \
    && go version \
    && tinygo version \
    && node --version && npm --version \
    && rustc --version && cargo --version \
    && cargo component --version \
    && wit-bindgen-go --version \
    && wasm-tools --version \
    && wkg --version \
    && wasm-opt --version

CMD ["bash"]
