#!/usr/bin/env bash
# Build every Better Together sample into a WebAssembly component.
#
# Designed to run inside the `better-together-tools` image with the repository
# mounted (or checked out) at the working directory. Outputs are collected into
# ./dist as <sample>.wasm and validated with `wasm-tools`.
set -euo pipefail

# Repository root. Defaults to the parent of this script's directory, but can be
# overridden with REPO_ROOT (useful when the script is invoked from elsewhere).
ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DIST="${ROOT}/dist"
mkdir -p "${DIST}"

echo "==> ferris  (Rust / wit-bindgen / wasm32-wasip2)"
( cd "${ROOT}/samples/ferris" && cargo build --release --target wasm32-wasip2 )
cp "${ROOT}/samples/ferris/target/wasm32-wasip2/release/ferris.wasm" "${DIST}/ferris.wasm"

echo "==> corro   (Rust / cargo-component / wasm32-wasip1)"
( cd "${ROOT}/samples/corro" && cargo component build --release )
cp "${ROOT}/samples/corro/target/wasm32-wasip1/release/corro.wasm" "${DIST}/corro.wasm"

echo "==> khaos   (JavaScript / jco + ComponentizeJS)"
( cd "${ROOT}/samples/khaos" && npm install && npm run build )
cp "${ROOT}/samples/khaos/khaos.wasm" "${DIST}/khaos.wasm"

echo "==> reynard (JavaScript / jco + ComponentizeJS)"
( cd "${ROOT}/samples/reynard" && npm install && npm run build )
cp "${ROOT}/samples/reynard/reynard.wasm" "${DIST}/reynard.wasm"

echo "==> gopher  (Go / TinyGo / wit-bindgen-go)"
(
  cd "${ROOT}/samples/gopher"
  # Disable VCS stamping: the build often runs on a checkout owned by another
  # user (e.g. a bind-mounted repo), which makes `go` refuse to read git state.
  export GOFLAGS="-buildvcs=false"
  go mod download
  wit-bindgen-go generate --world gopher --out internal ./wit
  tinygo build -target=wasip2 --wit-package ./wit --wit-world gopher -o gopher.wasm .
)
cp "${ROOT}/samples/gopher/gopher.wasm" "${DIST}/gopher.wasm"

echo "==> micro   (hand-written WebAssembly text / wasm-tools)"
( cd "${ROOT}/samples/micro" && wasm-tools parse src/micro.wat -o micro.wasm )
cp "${ROOT}/samples/micro/micro.wasm" "${DIST}/micro.wasm"

echo "==> keith   (C++ / wit-bindgen cpp / wasm32-wasip2)"
( cd "${ROOT}/samples/keith" && ./build.sh )
cp "${ROOT}/samples/keith/keith.wasm" "${DIST}/keith.wasm"

echo "==> andy    (C# / componentize-dotnet / NativeAOT-LLVM / wasi-wasm)"
(
  cd "${ROOT}/samples/andy"
  # Restore + build the WASI 0.2 component. componentize-dotnet downloads and
  # caches a compatible WASI SDK + LLVM into the home dir on the first build.
  dotnet build -c Release
)
cp "${ROOT}/samples/andy/bin/Release/net10.0/wasi-wasm/native/andy.wasm" "${DIST}/andy.wasm"

echo "==> bram    (C# / componentize-dotnet / NativeAOT-LLVM / wasi-wasm)"
(
  cd "${ROOT}/samples/bram"
  # Same toolchain as andy: NativeAOT-LLVM emits the WASI 0.2 component.
  dotnet build -c Release
)
cp "${ROOT}/samples/bram/bin/Release/net10.0/wasi-wasm/native/bram.wasm" "${DIST}/bram.wasm"

echo "==> dusty   (Grain / hand-written canonical ABI / preview1 -> preview2 adapt)"
(
  cd "${ROOT}/samples/dusty"
  # The reactor adapter is baked into the tools image; fall back to its default
  # path so the script also works in a hand-set-up environment.
  adapter="${WASI_REACTOR_ADAPTER:-/opt/wasi-adapters/wasi_snapshot_preview1.reactor.wasm}"
  # 1. Grain -> core wasm (reactor: init runs from the wasm start section).
  grain compile --release --use-start-section src/dusty.gr -o dusty.core.wasm
  # 2. Embed the component-type info from the vendored ./wit.
  wasm-tools component embed wit dusty.core.wasm -o dusty.embed.wasm --world dusty
  # 3. Wrap into a component, adapting WASI preview1 -> preview2.
  wasm-tools component new dusty.embed.wasm \
    --adapt "wasi_snapshot_preview1=${adapter}" \
    -o dusty.wasm
)
cp "${ROOT}/samples/dusty/dusty.wasm" "${DIST}/dusty.wasm"

echo
echo "==> validating components"
for sample in ferris corro khaos gopher micro keith andy dusty bram reynard; do
  echo "--- ${sample}.wasm ---"
  wasm-tools validate "${DIST}/${sample}.wasm"
  wasm-tools component wit "${DIST}/${sample}.wasm" | grep -E 'better-together:gardener/player' || true
done

echo
echo "Built components:"
ls -lh "${DIST}"
