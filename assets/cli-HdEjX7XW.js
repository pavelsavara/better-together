const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/wasip2-via-wasip3-DTlVlWiE.js","assets/wasip3-BtyVJBiz.js"])))=>i.map(i=>d[i]);
import{_ as T}from"./index-BOTDD_l3.js";import{loadWasiP1ViaP3Adapter as $,createComponent as O,loadWasiP3Serve as H}from"./index-1qVdZ9t7.js";import{NETWORK_DEFAULTS as g,LIMIT_DEFAULTS as y}from"./wasip3-BtyVJBiz.js";var A={};const R=`Runs a WebAssembly component

Usage: jsco run [OPTIONS] <WASM>

Arguments:
  <WASM>  The WebAssembly component to run

Options:
  -v, --verbose              Enable verbose logging
  --use-number-for-int64     Use JavaScript number instead of BigInt for i64
  --no-jspi                  Disable JSPI (WebAssembly.Suspending/promising)
  --yield-throttle <N>       Yield to JS event loop every N canon built-in calls
  --validate-types           Enable type validation
  --dir <HOST_DIR[::GUEST_DIR[::ro]]>
                             Grant access of a host directory to a guest.
                             If specified as just HOST_DIR then the same
                             directory name on the host is made available
                             within the guest. If specified as HOST::GUEST
                             then the HOST directory is opened and made
                             available as the name GUEST in the guest.
  --env <NAME[=VAL]>         Pass an environment variable to the program.
                             The --env FOO=BAR form will set the environment
                             variable named FOO to the value BAR for the
                             guest. The --env FOO form will inherit the
                             variable from the calling process.
  --env-inherit              Inherit all host environment variables
  --cwd <PATH>               Set the working directory for the component
  --enable <PREFIX>          Enable only WASI interfaces matching prefix
                             (e.g. --enable wasi:http --enable wasi:cli)
                             By default all interfaces are enabled.
  -h, --help                 Print help

Arguments after -- are passed to the component via wasi:cli/environment.

Networking options:
  --max-http-body-bytes <N>           Max HTTP body size in bytes (default: ${g.maxHttpBodyBytes})
  --max-http-headers-bytes <N>        Max HTTP headers size in bytes (default: ${g.maxHttpHeadersBytes})
  --max-tcp-pending <N>               Max pending TCP connections (default: ${g.maxTcpPendingConnections})
  --tcp-idle-timeout-ms <N>           TCP idle timeout in ms (default: ${g.tcpIdleTimeoutMs})
  --http-request-timeout-ms <N>       HTTP request timeout in ms (default: ${g.httpRequestTimeoutMs})
  --max-udp-datagrams <N>             Max queued UDP datagrams (default: ${g.maxUdpDatagrams})
  --dns-timeout-ms <N>                DNS lookup timeout in ms (default: ${g.dnsTimeoutMs})
  --max-concurrent-dns <N>            Max concurrent DNS lookups (default: ${g.maxConcurrentDnsLookups})
  --max-http-connections <N>          Max concurrent HTTP server connections (default: ${g.maxHttpConnections})
  --max-request-url-bytes <N>         Max request URL length in bytes (default: ${g.maxRequestUrlBytes})
  --http-headers-timeout-ms <N>       Slowloris protection: headers timeout (default: ${g.httpHeadersTimeoutMs})
  --http-keep-alive-timeout-ms <N>    HTTP keep-alive timeout (default: ${g.httpKeepAliveTimeoutMs})

Resource limits:
  --max-allocation-size <N>           Max single allocation size in bytes (default: ${y.maxAllocationSize})
  --max-handles <N>                   Max live resource handles per table (default: ${y.maxHandles})
  --max-path-length <N>               Max filesystem path length in bytes (default: ${y.maxPathLength})
  --max-memory-bytes <N>              Max WASM linear-memory size in bytes; 0 disables (default: ${y.maxMemoryBytes})
  --max-canon-ops-without-yield <N>   Max canon built-in ops between JSPI yields; 0 disables (default: ${y.maxCanonOpsWithoutYield})
  --max-blocking-time-ms <N>          Max ms any single JSPI suspension may block; 0 disables (default: ${y.maxBlockingTimeMs})
  --max-heap-growth-per-yield <N>     Max host heap growth (bytes) between JSPI yields; 0 disables (default: ${y.maxHeapGrowthPerYield})
  --max-network-buffer-size <N>       Max host-side network buffer (HTTP body / stream forward / socket buffer) in bytes (default: ${y.maxNetworkBufferSize})
`,D=`Serves requests from a wasi:http proxy component

Usage: jsco serve [OPTIONS] <WASM>

Arguments:
  <WASM>  The WebAssembly component to serve

Options:
  --addr <SOCKADDR>          Socket address to bind to [default: 0.0.0.0:8080]
  -v, --verbose              Enable verbose logging (e.g. handler errors)
  --use-number-for-int64     Use JavaScript number instead of BigInt for i64
  --no-jspi                  Disable JSPI (WebAssembly.Suspending/promising)
  --yield-throttle <N>       Yield to JS event loop every N canon built-in calls
  --validate-types           Enable type validation
  --dir <HOST_DIR[::GUEST_DIR[::ro]]>
                             Grant access of a host directory to a guest
  --env <NAME[=VAL]>         Pass an environment variable to the program
  --env-inherit              Inherit all host environment variables
  --cwd <PATH>               Set the working directory for the component
  --enable <PREFIX>          Enable only WASI interfaces matching prefix
  -h, --help                 Print help

Arguments after -- are passed to the component via wasi:cli/environment.

Networking options:
  --max-http-body-bytes <N>           Max HTTP body size in bytes (default: ${g.maxHttpBodyBytes})
  --max-http-headers-bytes <N>        Max HTTP headers size in bytes (default: ${g.maxHttpHeadersBytes})
  --max-http-connections <N>          Max concurrent HTTP server connections (default: ${g.maxHttpConnections})
  --max-request-url-bytes <N>         Max request URL length in bytes (default: ${g.maxRequestUrlBytes})
  --http-request-timeout-ms <N>       HTTP request timeout in ms (default: ${g.httpRequestTimeoutMs})
  --http-headers-timeout-ms <N>       Slowloris protection: headers timeout (default: ${g.httpHeadersTimeoutMs})
  --http-keep-alive-timeout-ms <N>    HTTP keep-alive timeout (default: ${g.httpKeepAliveTimeoutMs})

Resource limits:
  --max-allocation-size <N>           Max single allocation size in bytes (default: ${y.maxAllocationSize})
  --max-handles <N>                   Max live resource handles per table (default: ${y.maxHandles})
  --max-path-length <N>               Max filesystem path length in bytes (default: ${y.maxPathLength})
  --max-memory-bytes <N>              Max WASM linear-memory size in bytes; 0 disables (default: ${y.maxMemoryBytes})
  --max-canon-ops-without-yield <N>   Max canon built-in ops between JSPI yields; 0 disables (default: ${y.maxCanonOpsWithoutYield})
  --max-blocking-time-ms <N>          Max ms any single JSPI suspension may block; 0 disables (default: ${y.maxBlockingTimeMs})
  --max-heap-growth-per-yield <N>     Max host heap growth (bytes) between JSPI yields; 0 disables (default: ${y.maxHeapGrowthPerYield})
  --max-network-buffer-size <N>       Max host-side network buffer (HTTP body / stream forward / socket buffer) in bytes (default: ${y.maxNetworkBufferSize})
`;function b(a,h,v,x){if(a.startsWith(h+"="))return{val:a.substring(h.length+1),nextI:x};if(a===h){const c=v[x+1];return c===void 0||c.startsWith("-")?null:{val:c,nextI:x+1}}}let M;async function k(){var a;return typeof process<"u"&&((a=process.versions)!=null&&a.node)?T(()=>import("../../game/node_modules/@pavelsavara/jsco/wasip3-node.js"),[]):T(()=>import("./wasip3-BtyVJBiz.js"),[])}async function N(){return T(()=>import("./wasip2-via-wasip3-DTlVlWiE.js"),__vite__mapDeps([0,1]))}var z=Object.freeze({__proto__:null,loadWasiP2ViaP3Adapter:N,loadWasiP3Host:k});function j(a,h){const v=()=>{throw new Error(`WASI interface "${a}" is disabled (not listed in enabledInterfaces)`)};if(h&&typeof h=="object"){const x={};for(const c of Object.keys(h))x[c]=v;return x}return v}function S(a,h){if(h)for(const v of Object.keys(a))h.some(x=>v.startsWith(x))||(a[v]=j(v,a[v]))}function U(a){for(const h of a)if(h.startsWith("wasi:"))return/@0\.2/.test(h)?2:3;return 0}const B=typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string";async function W(a){if("length"in a||"getReader"in a)return a;if("body"in a){const h=a.body;if(!h)throw new Error("Response body is null");return W(h)}if("then"in a)return W(await a);throw new Error("I got "+typeof a)}async function G(){if(typeof process>"u"||process.versions==null||process.versions.node==null)return;const a=(await T(async()=>{const{realpathSync:l}=await import("node:fs");return{realpathSync:l}},[])).realpathSync,h=(await T(async()=>{const{pathToFileURL:l}=await import("node:url");return{pathToFileURL:l}},[])).pathToFileURL,v=process.argv[1];if(!v)return;const x=h(a(v)).href;if(import.meta.url!==x)return;if(!function(){if(M!==void 0)return M;try{M=typeof WebAssembly<"u"&&typeof WebAssembly.Suspending=="function"}catch{M=!1}return M}()){const l=(0,(await T(async()=>{const{spawnSync:i}=await import("node:child_process");return{spawnSync:i}},[])).spawnSync)(process.execPath,["--experimental-wasm-jspi",...process.execArgv,v,...process.argv.slice(2)],{stdio:"inherit"});process.exit(l.status??1)}const c=function(l){let i,t,m="run",p=!1;const o={useNumberForInt64:!1,noJspi:!1,yieldThrottle:void 0,validateTypes:!0,network:{},limits:{},env:{},envInheritNames:[],envInheritAll:!1,mounts:[],cwd:void 0,enabledInterfaces:void 0,addr:void 0,componentArgs:[],verbose:!1};let w,d=0;const u=l[0];if(u==="run")m="run",d=1;else if(u==="serve")m="serve",d=1;else if(u==="help"){const r=l[1];return r==="run"||r==="serve"?{command:r,componentUrl:void 0,options:o,error:void 0,help:!0}:{command:"run",componentUrl:void 0,options:o,error:void 0,help:!0}}for(let r=d;r<l.length;r++){const n=l[r];if(n)if(n==="--help"||n==="-h")p=!0;else if(n==="--use-number-for-int64")o.useNumberForInt64=!0;else if(n==="--no-jspi")o.noJspi=!0;else if(n.startsWith("--yield-throttle")){const e=b(n,"--yield-throttle",l,r);if(!e)return t="Missing value for --yield-throttle",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=Number.parseInt(e.val,10);if(!Number.isFinite(s)||s<=0)return t=`Invalid value for --yield-throttle: ${e.val} (expected positive integer)`,{command:m,componentUrl:i,options:o,error:t,help:p};o.yieldThrottle=s}else if(n==="--verbose"||n==="-v")o.verbose=!0;else if(n==="--validate-types")o.validateTypes=!0;else if(n.startsWith("--component="))i=n.substring(12);else if(n==="--env-inherit")o.envInheritAll=!0;else if(n.startsWith("--env")){const e=b(n,"--env",l,r);if(!e)return t="Missing value for --env",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=e.val,f=s.indexOf("=");f===-1?o.envInheritNames.push(s):o.env[s.substring(0,f)]=s.substring(f+1)}else if(n.startsWith("--dir")){const e=b(n,"--dir",l,r);if(!e)return t="Missing value for --dir",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=e.val,f=s.split("::");if(f.length===1)o.mounts.push({hostPath:f[0],guestPath:f[0],readOnly:!1});else if(f.length===2)o.mounts.push({hostPath:f[0],guestPath:f[1],readOnly:!1});else{if(f.length!==3||f[2]!=="ro")return t=`Invalid --dir format: ${s} (expected HOST_DIR, HOST::GUEST, or HOST::GUEST::ro)`,{command:m,componentUrl:i,options:o,error:t,help:p};o.mounts.push({hostPath:f[0],guestPath:f[1],readOnly:!0})}}else if(n.startsWith("--cwd")){const e=b(n,"--cwd",l,r);if(!e)return t="Missing value for --cwd",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.cwd=e.val}else if(n.startsWith("--enable")){const e=b(n,"--enable",l,r);if(!e)return t="Missing value for --enable",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,w||(w=[]),w.push(e.val),o.enabledInterfaces=w}else if(n.startsWith("--addr")){const e=b(n,"--addr",l,r);if(!e)return t="Missing value for --addr",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.addr=e.val}else if(n.startsWith("--max-allocation-size")){const e=b(n,"--max-allocation-size",l,r);if(!e)return t="Missing value for --max-allocation-size",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=Number.parseInt(e.val,10);if(!Number.isFinite(s)||s<0)return t=`Invalid value for --max-allocation-size: ${e.val} (expected non-negative integer)`,{command:m,componentUrl:i,options:o,error:t,help:p};o.limits.maxAllocationSize=s}else if(n.startsWith("--max-handles")){const e=b(n,"--max-handles",l,r);if(!e)return t="Missing value for --max-handles",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=Number.parseInt(e.val,10);if(!Number.isFinite(s)||s<0)return t=`Invalid value for --max-handles: ${e.val} (expected non-negative integer)`,{command:m,componentUrl:i,options:o,error:t,help:p};o.limits.maxHandles=s}else if(n.startsWith("--max-path-length")){const e=b(n,"--max-path-length",l,r);if(!e)return t="Missing value for --max-path-length",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=Number.parseInt(e.val,10);if(!Number.isFinite(s)||s<0)return t=`Invalid value for --max-path-length: ${e.val} (expected non-negative integer)`,{command:m,componentUrl:i,options:o,error:t,help:p};o.limits.maxPathLength=s}else if(n.startsWith("--max-memory-bytes")){const e=b(n,"--max-memory-bytes",l,r);if(!e)return t="Missing value for --max-memory-bytes",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=Number.parseInt(e.val,10);if(!Number.isFinite(s)||s<0)return t=`Invalid value for --max-memory-bytes: ${e.val} (expected non-negative integer; 0 disables)`,{command:m,componentUrl:i,options:o,error:t,help:p};o.limits.maxMemoryBytes=s}else if(n.startsWith("--max-canon-ops-without-yield")){const e=b(n,"--max-canon-ops-without-yield",l,r);if(!e)return t="Missing value for --max-canon-ops-without-yield",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=Number.parseInt(e.val,10);if(!Number.isFinite(s)||s<0)return t=`Invalid value for --max-canon-ops-without-yield: ${e.val} (expected non-negative integer; 0 disables)`,{command:m,componentUrl:i,options:o,error:t,help:p};o.limits.maxCanonOpsWithoutYield=s}else if(n.startsWith("--max-blocking-time-ms")){const e=b(n,"--max-blocking-time-ms",l,r);if(!e)return t="Missing value for --max-blocking-time-ms",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=Number.parseInt(e.val,10);if(!Number.isFinite(s)||s<0)return t=`Invalid value for --max-blocking-time-ms: ${e.val} (expected non-negative integer; 0 disables)`,{command:m,componentUrl:i,options:o,error:t,help:p};o.limits.maxBlockingTimeMs=s}else if(n.startsWith("--max-heap-growth-per-yield")){const e=b(n,"--max-heap-growth-per-yield",l,r);if(!e)return t="Missing value for --max-heap-growth-per-yield",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=Number.parseInt(e.val,10);if(!Number.isFinite(s)||s<0)return t=`Invalid value for --max-heap-growth-per-yield: ${e.val} (expected non-negative integer; 0 disables)`,{command:m,componentUrl:i,options:o,error:t,help:p};o.limits.maxHeapGrowthPerYield=s}else if(n.startsWith("--max-network-buffer-size")){const e=b(n,"--max-network-buffer-size",l,r);if(!e)return t="Missing value for --max-network-buffer-size",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI;const s=Number.parseInt(e.val,10);if(!Number.isFinite(s)||s<=0)return t=`Invalid value for --max-network-buffer-size: ${e.val} (expected positive integer)`,{command:m,componentUrl:i,options:o,error:t,help:p};o.limits.maxNetworkBufferSize=s}else if(n.startsWith("--max-http-body-bytes")){const e=b(n,"--max-http-body-bytes",l,r);if(!e)return t="Missing value for --max-http-body-bytes",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.maxHttpBodyBytes=parseInt(e.val,10)||0}else if(n.startsWith("--max-http-headers-bytes")){const e=b(n,"--max-http-headers-bytes",l,r);if(!e)return t="Missing value for --max-http-headers-bytes",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.maxHttpHeadersBytes=parseInt(e.val,10)||0}else if(n.startsWith("--max-tcp-pending")){const e=b(n,"--max-tcp-pending",l,r);if(!e)return t="Missing value for --max-tcp-pending",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.maxTcpPendingConnections=parseInt(e.val,10)||0}else if(n.startsWith("--tcp-idle-timeout-ms")){const e=b(n,"--tcp-idle-timeout-ms",l,r);if(!e)return t="Missing value for --tcp-idle-timeout-ms",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.tcpIdleTimeoutMs=parseInt(e.val,10)||0}else if(n.startsWith("--http-request-timeout-ms")){const e=b(n,"--http-request-timeout-ms",l,r);if(!e)return t="Missing value for --http-request-timeout-ms",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.httpRequestTimeoutMs=parseInt(e.val,10)||0}else if(n.startsWith("--max-udp-datagrams")){const e=b(n,"--max-udp-datagrams",l,r);if(!e)return t="Missing value for --max-udp-datagrams",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.maxUdpDatagrams=parseInt(e.val,10)||0}else if(n.startsWith("--dns-timeout-ms")){const e=b(n,"--dns-timeout-ms",l,r);if(!e)return t="Missing value for --dns-timeout-ms",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.dnsTimeoutMs=parseInt(e.val,10)||0}else if(n.startsWith("--max-concurrent-dns")){const e=b(n,"--max-concurrent-dns",l,r);if(!e)return t="Missing value for --max-concurrent-dns",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.maxConcurrentDnsLookups=parseInt(e.val,10)||0}else if(n.startsWith("--max-http-connections")){const e=b(n,"--max-http-connections",l,r);if(!e)return t="Missing value for --max-http-connections",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.maxHttpConnections=parseInt(e.val,10)||0}else if(n.startsWith("--max-request-url-bytes")){const e=b(n,"--max-request-url-bytes",l,r);if(!e)return t="Missing value for --max-request-url-bytes",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.maxRequestUrlBytes=parseInt(e.val,10)||0}else if(n.startsWith("--http-headers-timeout-ms")){const e=b(n,"--http-headers-timeout-ms",l,r);if(!e)return t="Missing value for --http-headers-timeout-ms",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.httpHeadersTimeoutMs=parseInt(e.val,10)||0}else if(n.startsWith("--http-keep-alive-timeout-ms")){const e=b(n,"--http-keep-alive-timeout-ms",l,r);if(!e)return t="Missing value for --http-keep-alive-timeout-ms",{command:m,componentUrl:i,options:o,error:t,help:p};r=e.nextI,o.network.httpKeepAliveTimeoutMs=parseInt(e.val,10)||0}else{if(n==="--"){o.componentArgs=l.slice(r+1);break}if(n.startsWith("-"))return t=`Unknown argument: ${n}`,{command:m,componentUrl:i,options:o,error:t,help:p};if(!n.endsWith(".wasm"))return t=`Unknown argument: ${n}`,{command:m,componentUrl:i,options:o,error:t,help:p};i=n}}return p?{command:m,componentUrl:i,options:o,error:void 0,help:p}:(i||(t=`usage: jsco ${m} [options] <component.wasm>
Try --help for more information.`),{command:m,componentUrl:i,options:o,error:t,help:p})}(process.argv.slice(2));c.help&&(console.log(function(l){switch(l){case"run":return R;case"serve":return D;default:return`jsco WebAssembly Component Runtime

Usage: jsco [OPTIONS] <WASM>
       jsco <COMMAND> [OPTIONS] <WASM>

Commands:
  run         Runs a WebAssembly component [default]
  serve       Serves requests from a wasi:http proxy component
  help        Print this message or the help of the given subcommand

If a subcommand is not provided, the \`run\` subcommand will be used.

Common Options:
  -v, --verbose              Enable verbose logging
  --use-number-for-int64     Use JavaScript number instead of BigInt for i64
  --no-jspi                  Disable JSPI (WebAssembly.Suspending/promising)
  --yield-throttle <N>       Yield to JS event loop every N canon built-in calls
  --validate-types           Enable type validation
  --dir <HOST_DIR[::GUEST_DIR[::ro]]>
                             Grant access of a host directory to a guest
  --env <NAME[=VAL]>         Pass an environment variable to the program
  --env-inherit              Inherit all host environment variables
  --cwd <PATH>               Set the working directory for the component
  --enable <PREFIX>          Enable only WASI interfaces matching prefix
  -h, --help                 Print help

Arguments after -- are passed to the component via wasi:cli/environment.
`}}(c.command)),process.exit(0)),c.error&&(console.error(c.error),process.exit(1)),c.componentUrl||process.exit(1),await C(c)}async function C({command:a,componentUrl:h,options:v}){var x;try{const c=q(v,h,a),l=await async function(d){const u=await function(n){const e=n.startsWith("file://"),s=n.startsWith("https://")||n.startsWith("http://");if(B&&(e||!s))return T(()=>import("./__vite-browser-external-BIHI7g3E.js"),[]).then(f=>f.readFile(n));if(typeof globalThis.fetch!="function")throw new Error("globalThis.fetch is not a function");return globalThis.fetch(n)}(d);if(u instanceof Uint8Array)return new Uint8Array(u);const r=await W(u);if(r instanceof Uint8Array)return new Uint8Array(r);throw new Error(`Failed to read component bytes from ${d}`)}(h);if(function(d){return d.length>=8&&d[0]===0&&d[1]===97&&d[2]===115&&d[3]===109&&d[4]===1&&d[5]===0&&d[6]===0&&d[7]===0}(l)){if(a==="serve")throw new Error("WASI P1 core modules do not support the serve command");const d=await WebAssembly.compile(l),{createWasiP1ViaP3Adapter:u}=await $(),{loadWasiP3Host:r}=await Promise.resolve().then(function(){return z}),{createWasiP3Host:n}=await r(),e=u(n(c)),s={};for(const[_,E]of Object.entries(e.imports.wasi_snapshot_preview1))s[_]=new WebAssembly.Suspending(E);const f=await WebAssembly.instantiate(d,{wasi_snapshot_preview1:s}),I=f.exports.memory;I&&e.bindMemory(I);const P=f.exports._start;return void(P&&await WebAssembly.promising(P)())}const i=await O(h,v),t=i.exports(),m=function(d,u){return U(d)||U(u)}(t,i.imports()),p=m===0?3:m,o=await async function(d,u){if(d===0)return;const{createWasiP3Host:r}=await k(),n=r(u);if(d===2){const s=(await N()).createWasiP2ViaP3Adapter(n,{limits:u==null?void 0:u.limits});return S(s,u==null?void 0:u.enabledInterfaces),s}const e={...(await N()).createWasiP2ViaP3Adapter(n,{limits:u==null?void 0:u.limits}),...n};return S(e,u==null?void 0:u.enabledInterfaces),e}(p,c),w=await i.instantiate(o);if(a==="run"){const d=t.find(r=>r.startsWith("wasi:cli/run"));if(!d)throw new Error("Component does not export wasi:cli/run");const u=(x=w.exports[d])==null?void 0:x.run;if(!u)throw new Error("Component does not export wasi:cli/run");await u()}else{if(a!=="serve")throw new Error(`Unknown command: ${a}`);{const d=t.find(s=>s.startsWith("wasi:http/incoming-handler")||s.startsWith("wasi:incoming-handler/handle")||s.startsWith("wasi:http/handler"));if(!d)throw new Error("Component does not export wasi:http/incoming-handler or wasi:http/handler");const u=w.exports[d];if(!u)throw new Error("Component does not export wasi:http/incoming-handler or wasi:http/handler");let r,n;if(v.addr){const s=v.addr.lastIndexOf(":");if(s<0)throw new Error(`Invalid --addr value (expected host:port): ${v.addr}`);r=v.addr.slice(0,s);const f=v.addr.slice(s+1),I=Number.parseInt(f,10);if(!Number.isFinite(I)||I<0||I>65535)throw new Error(`Invalid --addr port: ${f}`);n=I}const e=await(await H()).serve(u,{host:r,port:n,network:c.network,...v.verbose?{onError:(s,f)=>console.error(s,f instanceof Error?f.stack??f.message:f)}:{}});console.log(`jsco serve: listening on ${r??"127.0.0.1"}:${e.port}`)}}}catch(c){if(c instanceof Error&&c.name==="WasiExit"){const l="exitCode"in c?c.exitCode:"status"in c?c.status:1;process.exit(l)}console.error(c instanceof Error?c.stack??c.message:c),process.exit(1)}}function F(a,h,v){if(v!=="run"||!h)return a.componentArgs.length>0?a.componentArgs:void 0;const x=function(l){const i=l.replace(/\\/g,"/"),t=i.lastIndexOf("/"),m=t>=0?i.slice(t+1):i;return m.length>0?m:l}(h);if(a.componentArgs.length===0)return[x];const c=a.componentArgs[0];return c===x||c===h?a.componentArgs:[x,...a.componentArgs]}function q(a,h,v){const x={};a.envInheritAll&&Object.assign(x,A);for(const l of a.envInheritNames)l in A&&(x[l]=A[l]);Object.assign(x,a.env);const c=Object.keys(x).length>0?Object.entries(x):void 0;return{network:a.network,limits:Object.keys(a.limits).length>0?a.limits:void 0,enabledInterfaces:a.enabledInterfaces,env:c,mounts:a.mounts.length>0?a.mounts:void 0,cwd:a.cwd,args:F(a,h,v)}}export{G as cliMain,q as createConfig,C as main};
