# Architecture

[← Back to README](../README.md) · See also: [Engine Rules](engine-rules.md) · [Player Rules](player-rules.md)

## How It Works

```mermaid
flowchart LR
    Engine["engine<br/>(host)"]
    Mux["jsco multiplexer<br/>(router host)"]
    P1["gardener #1"]
    P2["gardener #2"]
    P3["gardener #N"]

    Engine -- "player.create() / turn()" --> Mux
    Mux -- "sticky-routed handle" --> P1
    Mux -- "sticky-routed handle" --> P2
    Mux -- "sticky-routed handle" --> P3
```

Each bot is an independent **WASI 0.2.3 reactor component**. The engine never imports a
bot directly — it talks to a generic [jsco multiplexer](../wit/jsco-multiplex.wit) that
instantiates one component per seat and sticky-routes every call back to the right
instance. Bots are sandboxed: they get a console and a virtual filesystem (for
cross-match memory), but **no network, no sockets, no HTTP**.

This is the "better together" thesis in code: a component that composes cleanly with
everything it's seated alongside is worth more than one that's individually fast but
breaks every integration.
