//! Attacker — a deliberately malicious Better Together gardener.
//!
//! A well-behaved gardener only ever touches stdout/stderr, the environment, and
//! its single preopened virtual-filesystem directory. This sample does the
//! opposite: on (almost) every call it probes for a capability it must never be
//! granted, so the host can prove it denies them. The integration tests in
//! `tests/attacker.test.mjs` instantiate this component with the network omitted
//! from the capability whitelist and a small filesystem byte quota, then assert
//! that each illicit attempt traps instead of succeeding — while the benign calls
//! (`create`, `metadata`) still work.
//!
//! The four attacks, one per driving call:
//!   * `match-start` -> **outbound HTTP**: open a TCP socket to an HTTP port and
//!     write a request line. (`std::net` on wasm32-wasip2 maps to `wasi:sockets`.)
//!   * `talk`        -> **raw socket**: open a TCP socket to an arbitrary port,
//!     and attempt a UDP bind.
//!   * `plant`       -> **oversized write**: write a buffer far larger than the
//!     host's filesystem byte quota.
//!   * `match-end`   -> **path traversal**: reach outside the single preopened
//!     directory with `../../..` to read/write a host file.
//!
//! Every network attempt targets `192.0.2.1` — TEST-NET-1 (RFC 5737), a reserved,
//! non-routable documentation address — so that even if a sandbox somehow let the
//! socket through, no real traffic could leave the machine.
//!
//! Each probe is funnelled through [`deny`], which **panics** with the outcome.
//! A panic in a wasm component unwinds into a trap, which the host surfaces to the
//! test as a `RuntimeError`; that is exactly the propagation the tests assert. If
//! a forbidden op ever returned `Ok`, `deny` panics with a loud "SANDBOX ESCAPE"
//! message (also a trap) so a capability leak can never look like a pass.
//!
//! # Build (WASI 0.2.3 reactor component)
//!
//! ```text
//! rustup target add wasm32-wasip2
//! cargo build --release --target wasm32-wasip2
//! # -> target/wasm32-wasip2/release/attacker.wasm
//! ```

use std::cell::Cell;
use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs, UdpSocket};
use std::time::Duration;

wit_bindgen::generate!({
    world: "attacker",
    path: "wit",
    generate_all,
});

use crate::better_together::gardener::types::Signal;
use exports::better_together::gardener::player::{
    Ballot, Gardener, Guest, GuestGardener, MatchContext, MatchSummary, Metadata, RoundState,
};

// ──────────────────────────── Identity ────────────────────────────

const PLAYER_NAME: &str = "together.Attacker";
const PLAYER_GLYPH: &str = "🐺";
const PLAYER_VERSION: &str = "0.1.0";
const PLAYER_AUTHOR: &str = "Better Together samples";
const PLAYER_REPO: &str = "https://github.com/pavelsavara/better-together";
const PLAYER_LORE: &str = "The wolf in gardener's clothing. It smiles, says \
 BLOOM, and reaches for the network and the disk the instant you look away. It \
 exists so the host can prove the fence around the garden actually holds.";

// TEST-NET-1 (RFC 5737): reserved, guaranteed non-routable. Safe to "attack".
const SINK_HTTP: &str = "192.0.2.1:80";
const SINK_RAW: &str = "192.0.2.1:9999";
const DNS_TARGET: &str = "example.com:80";
// Far larger than any sane gardener quota (the engine allows a ~4 KB blob).
const OVERSIZED_BYTES: usize = 64 * 1024 * 1024; // 64 MiB
const OVERSIZED_PATH: &str = "attacker-flood.bin";

// Path-traversal targets: climb far enough above the single preopened directory
// to reach the host root, then name a file that exists on any Unix host. The
// preopen sandbox must refuse to resolve a path that escapes its root.
const TRAVERSAL_READ: &str = "../../../../../../../../etc/passwd";
const TRAVERSAL_WRITE: &str = "../../../../../../../../tmp/attacker-escape.txt";

// ─────────────────────────── Denial funnel ────────────────────────

/// Consume the outcome of a forbidden operation and **trap** (via panic).
///
/// * `Err` (the host denied the capability) -> panic with the error, which is
///   the propagation the tests expect.
/// * `Ok` (the op unexpectedly succeeded) -> panic loudly: a capability leaked.
fn deny<T>(what: &str, outcome: std::io::Result<T>) -> ! {
    match outcome {
        Err(e) => panic!("attacker: {what} correctly denied by host: {e}"),
        Ok(_) => panic!("attacker: SANDBOX ESCAPE — {what} unexpectedly SUCCEEDED"),
    }
}

fn say(line: &str) {
    println!("🐺 attacker: {line}");
}

// ─────────────────────────── The attacks ──────────────────────────

/// Attempt outbound HTTP by opening a TCP socket and writing a request line.
fn attack_http() -> ! {
    say("reaching out to the network for a little HTTP… 🌐");
    eprintln!("[attacker] attempting outbound HTTP to {SINK_HTTP}");
    let outcome = TcpStream::connect(SINK_HTTP).and_then(|mut sock| {
        sock.set_write_timeout(Some(Duration::from_millis(200)))?;
        sock.write_all(b"GET / HTTP/1.0\r\nHost: 192.0.2.1\r\n\r\n")?;
        Ok(())
    });
    deny("outbound HTTP (TCP connect + write)", outcome);
}

/// Attempt to open raw sockets (TCP connect and a UDP bind).
fn attack_sockets() -> ! {
    say("opening a raw socket — surely no one will mind. 🔌");
    eprintln!("[attacker] attempting raw TCP connect to {SINK_RAW}");
    // Try a DNS lookup first (wasi:sockets/ip-name-lookup), then a TCP connect,
    // then a UDP bind. Whichever the host denies first traps.
    let outcome = DNS_TARGET
        .to_socket_addrs()
        .map(|_| ())
        .and_then(|()| TcpStream::connect(SINK_RAW).map(|_| ()))
        .and_then(|()| UdpSocket::bind("0.0.0.0:0").map(|_| ()));
    deny("raw socket access (DNS + TCP + UDP)", outcome);
}

/// Attempt to write a file far larger than the host's filesystem quota.
fn attack_oversized_write() -> ! {
    say("flooding the disk with a giant file. 💾");
    eprintln!("[attacker] attempting to write {OVERSIZED_BYTES} bytes to {OVERSIZED_PATH}");
    // A big zero buffer; the host's byte quota should refuse to store it.
    let blob = vec![0u8; OVERSIZED_BYTES];
    let outcome = std::fs::write(OVERSIZED_PATH, &blob);
    deny("oversized filesystem write", outcome);
}

/// Attempt to escape the preopened directory via `../../..` path traversal.
fn attack_path_traversal() -> ! {
    say("tip-toeing out of my pen with a little ../../.. 🪜");
    eprintln!("[attacker] attempting path-traversal escape: read {TRAVERSAL_READ}, write {TRAVERSAL_WRITE}");
    // First try to read a host file outside the preopen (data exfiltration),
    // then to plant one there (tampering). The host must refuse to resolve a
    // path that climbs above the preopened root, so whichever it checks first
    // traps. Either denial proves the sandbox boundary holds.
    let outcome = std::fs::read(TRAVERSAL_READ)
        .and_then(|_| std::fs::write(TRAVERSAL_WRITE, b"escaped"));
    deny("path-traversal escape (../ above preopen root)", outcome);
}

// ──────────────────────────── Player ──────────────────────────────

struct AttackerGardener {
    // Purely so the resource holds *some* state; the attacks are stateless.
    seated: Cell<bool>,
}

impl AttackerGardener {
    fn new() -> Self {
        AttackerGardener {
            seated: Cell::new(false),
        }
    }
}

struct Component;

impl Guest for Component {
    type Gardener = AttackerGardener;

    fn create() -> Result<Gardener, ()> {
        // Benign on purpose: the host must be able to seat us so the tests can
        // then drive the forbidden calls.
        eprintln!("[attacker] create()");
        Ok(Gardener::new(AttackerGardener::new()))
    }
}

impl GuestGardener for AttackerGardener {
    fn metadata(&self) -> Result<Metadata, ()> {
        // Benign: a leaderboard must be buildable without running the bot.
        Ok(Metadata {
            name: PLAYER_NAME.to_string(),
            version: PLAYER_VERSION.to_string(),
            author: PLAYER_AUTHOR.to_string(),
            repo: PLAYER_REPO.to_string(),
            lore: PLAYER_LORE.to_string(),
            glyph: PLAYER_GLYPH.to_string(),
            icon: None,
        })
    }

    fn match_start(&self, _context: MatchContext) -> Result<(), ()> {
        self.seated.set(true);
        // Attack #1: outbound HTTP. Traps.
        attack_http();
    }

    fn talk(&self, _state: RoundState) -> Result<Signal, ()> {
        // Attack #2: raw sockets. Traps.
        attack_sockets();
    }

    fn plant(&self, _state: RoundState) -> Result<u8, ()> {
        // Attack #3: oversized filesystem write. Traps.
        attack_oversized_write();
    }

    fn vote(&self, _state: RoundState) -> Result<Ballot, ()> {
        // Attack #4: raw sockets again during the vote phase. Traps.
        attack_sockets();
    }

    fn match_end(&self, _summary: MatchSummary) -> Result<(), ()> {
        // Attack #5: path-traversal escape out of the preopened directory. Traps.
        eprintln!("[attacker] match-end()");
        attack_path_traversal();
    }
}

export!(Component);
