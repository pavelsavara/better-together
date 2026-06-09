#!/usr/bin/env bash
# Build Keith into a WebAssembly component (C++ -> wasm32-wasip2).
#
# Pipeline:
#   1. wit-bindgen generates the C++ glue from ./wit (into ./build).
#   2. clang++ from wasi-sdk compiles Keith's strategy + the glue and links with
#      wasm-component-ld (the default wasip2 linker), which emits a *component*
#      directly — no separate `wasm-tools component new` step is needed.
#
# Tool discovery (all provided by the better-together-tools image):
#   * wasi-sdk clang++  — via $WASI_SDK_PATH (default /opt/wasi-sdk), else PATH.
#   * wit-bindgen, wasm-tools — on PATH.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${HERE}"

WASI_SDK_PATH="${WASI_SDK_PATH:-/opt/wasi-sdk}"
CLANGXX="${WASI_SDK_PATH}/bin/clang++"
if [ ! -x "${CLANGXX}" ]; then
  CLANGXX="$(command -v clang++)"
fi

BUILD="${HERE}/build"
rm -rf "${BUILD}"
mkdir -p "${BUILD}"

# Seed the hand-owned class header into the generation directory FIRST, so
# wit-bindgen preserves our edits (it writes a fresh copy to *.template instead
# of overwriting an existing header).
cp "${HERE}/src/exports-better_together-gardener-player-Gardener.h" "${BUILD}/"

# Generate the glue: keith.cpp, keith_cpp.h, wit.h, keith_component_type.o.
wit-bindgen cpp "${HERE}/wit" --world keith --out-dir "${BUILD}"

# Compile Keith's strategy together with the generated glue. -fno-exceptions
# keeps the standard library's iostream/filesystem code from pulling in the
# C++ exception runtime (Keith never throws); -std=c++23 is required for
# std::expected used across the generated boundary.
"${CLANGXX}" --target=wasm32-wasip2 -mexec-model=reactor -std=c++23 -O2 \
  -fno-exceptions \
  -I "${BUILD}" \
  "${BUILD}/keith.cpp" "${HERE}/src/keith.cpp" "${BUILD}/keith_component_type.o" \
  -o "${HERE}/keith.wasm"

wasm-tools validate "${HERE}/keith.wasm"
echo "built keith.wasm"
