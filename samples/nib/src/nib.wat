;; Nib — a Better Together gardener hand-written in raw component-model WAT.
;;
;; Personality: the smallest possible *conditional cooperator*. Nib reads only
;; one thing — this round's talk — and otherwise carries no memory and no grudge.
;;
;; Strategy:
;;   * talk():  always broadcast `watch` ("I decide based on what others do").
;;              This is honest — Nib really does decide from the table's talk.
;;   * plant(): plant (number of `bloom` promises broadcast this round) + 4,
;;              clamped to 10. Because Nib itself always says `watch`, its own
;;              broadcast is never a `bloom`, so it simply counts every `bloom`
;;              in `state.signals` without needing to know its own id.
;;   * vote():  always abstain (`none`). Nib keeps no grudge and never taxes.
;;   * Each turn it writes one line of banter to stdout (flavor only).
;;
;; The whole thing is written by hand against the WebAssembly Component Model
;; canonical ABI: a bump-allocator `cabi_realloc`, a `gardener` resource minted
;; with `resource.new`, and `canon lift`/`canon lower` wiring. No language
;; runtime, no std, no allocator beyond the dozen-instruction bump heap below.
;;
;; Build:  wasm-tools parse src/nib.wat -o nib.wasm
;;         wasm-tools validate nib.wasm
;;         wasm-tools component wit nib.wasm
;;
;; ---------------------------------------------------------------------------
;; Static memory layout (linear memory, page-0 region; heap starts at 65536):
;;   512  create result area   : { u8 disc @512, i32 handle @516 }
;;   528  talk   result area   : { u8 disc @528, u8 signal @529 }
;;   536  plant  result area   : { u8 disc @536, u8 value  @537 }
;;   544  metadata result area : { u8 disc @544, record @548..608:
;;                                 6x(ptr,len) strings @548..596 (name,version,
;;                                 author,repo,lore,glyph), then
;;                                 icon option<string> @596 (u8 disc@596, ptr@600,len@604) }
;;   608  stream-write retptr scratch (result<_,stream-error>)
;;   640  vote   result area   : { u8 disc @640, ballot option<string> @644:
;;                                 u8 disc @644 (none = abstain), ptr@648, len@652 }
;;  1024  "together.Nib"                          (len 12)
;;  1040  "0.1.0"                                   (len 5)
;;  1056  "Better Together samples"                 (len 23)
;;  1120  "https://github.com/pavelsavara/better-together" (len 46)
;;  1184  lore                                      (len 185)
;;  1408  glyph "🖋️"                                 (len 4)
;;  1600  banter line (ends with \n)                (len 59)
;; ---------------------------------------------------------------------------

(component $nib
  ;; =====================================================================
  ;; Import the shared game value types (better-together:gardener/types).
  ;; This interface carries no functions — only the record/enum definitions
  ;; that the player methods reference. Importing it (rather than redefining
  ;; the types inline) ties them to the exact same package identity the
  ;; engine and the other sample bots use.
  ;; =====================================================================
  ;; NOTE: the `(option string)` for `icon` MUST be declared as an explicit
  ;; type (index 0) BEFORE the metadata record. Writing it inline in the field
  ;; makes wasm-tools hoist it to index 0 anyway, silently shifting every later
  ;; numeric type index by one and corrupting all the hand-written references.
  (type $ty-types (instance
    (type (option string))                                                  ;; 0
    (type (record (field "name" string) (field "version" string)
                  (field "author" string) (field "repo" string)
                  (field "lore" string) (field "glyph" string)
                  (field "icon" 0)))                                         ;; 1
    (export "metadata" (type (eq 1)))                                       ;; 2
    (type (enum "bloom" "hold" "watch"))                                    ;; 3
    (export "signal" (type (eq 3)))                                         ;; 4
    (type string)                                                           ;; 5
    (export "player-id" (type (eq 5)))                                      ;; 6
    (type (list 6))                                                         ;; 7
    (type (record (field "match-id" string) (field "players" 7)
                  (field "self-id" 6) (field "group-size" u8)))             ;; 8
    (export "match-context" (type (eq 8)))                                  ;; 9
    (type (record (field "id" 6) (field "plant" u8) (field "signal" 4)))    ;; 10
    (export "player-action" (type (eq 10)))                                 ;; 11
    (type (list 11))                                                        ;; 12  list<player-action>
    (type (option 6))                                                        ;; 13  option<player-id>
    (type (record (field "voter" 6) (field "target" 13)))                   ;; 14  vote-record
    (export "vote-record" (type (eq 14)))                                   ;; 15
    (type (list 15))                                                        ;; 16  list<vote-record>
    (type (record (field "actions" 12) (field "garden-total" u16)
                  (field "votes" 16) (field "tax-target" 13)
                  (field "tax-collected" u8) (field "garden-payout" f32)))   ;; 17  round-result
    (export "round-result" (type (eq 17)))                                  ;; 18
    (type (record (field "id" 6) (field "signal" 4)))                       ;; 19  signal-broadcast
    (export "signal-broadcast" (type (eq 19)))                              ;; 20
    (type (list 18))                                                        ;; 21  list<round-result>
    (type (list 20))                                                        ;; 22  list<signal-broadcast>
    (type (record (field "round" u8) (field "history" 21)
                  (field "signals" 22) (field "plants" 12)))                ;; 23  round-state
    (export "round-state" (type (eq 23)))                                   ;; 24
    (type (tuple 6 f32))                                                    ;; 25
    (type (list 25))                                                        ;; 26
    (type (record (field "rounds-played" u8) (field "final-scores" 26)
                  (field "your-score" f32)))                                ;; 27  match-summary
    (export "match-summary" (type (eq 27)))                                 ;; 28
  ))
  (import "better-together:gardener/types@0.1.0"
          (instance $types (type $ty-types)))
  (alias export $types "metadata"         (type $metadata))
  (alias export $types "signal"           (type $signal))
  (alias export $types "player-id"        (type $player-id))
  (alias export $types "match-context"    (type $match-context))
  (alias export $types "player-action"    (type $player-action))
  (alias export $types "vote-record"      (type $vote-record))
  (alias export $types "round-result"     (type $round-result))
  (alias export $types "signal-broadcast" (type $signal-broadcast))
  (alias export $types "round-state"      (type $round-state))
  (alias export $types "match-summary"    (type $match-summary))

  ;; =====================================================================
  ;; Import a minimal slice of WASI for stdout banter (no filesystem, no
  ;; persistence). Same shape as the jsco hello-p2-world-wat reference.
  ;; =====================================================================
  (type $io-error-iface (instance
    (export "error" (type (sub resource)))
  ))
  (import "wasi:io/error@0.2.3" (instance $io-error (type $io-error-iface)))
  (alias export $io-error "error" (type $error))

  (type $io-streams-iface (instance
    (export "output-stream" (type (sub resource)))                         ;; 0
    (alias outer $nib $error (type))                                     ;; 1
    (export "error" (type (eq 1)))                                         ;; 2
    (type (own 2))                                                         ;; 3
    (type (variant (case "last-operation-failed" 3) (case "closed")))      ;; 4
    (export "stream-error" (type (eq 4)))                                  ;; 5
    (type (borrow 0))                                                      ;; 6
    (type (list u8))                                                       ;; 7
    (type (result (error 5)))                                              ;; 8
    (type (func (param "self" 6) (param "contents" 7) (result 8)))         ;; 9
    (export "[method]output-stream.blocking-write-and-flush" (func (type 9)))
  ))
  (import "wasi:io/streams@0.2.3" (instance $io-streams (type $io-streams-iface)))

  (alias export $io-streams "output-stream" (type $output-stream))
  (type $stdout-iface (instance
    (alias outer $nib $output-stream (type))                             ;; 0
    (export "output-stream" (type (eq 0)))                                 ;; 1
    (type (own 1))                                                         ;; 2
    (type (func (result 2)))                                               ;; 3
    (export "get-stdout" (func (type 3)))
  ))
  (import "wasi:cli/stdout@0.2.3" (instance $stdout (type $stdout-iface)))

  ;; =====================================================================
  ;; The exported resource type (representation = i32). Nib is stateless,
  ;; so the rep is a constant and there is no destructor to run on drop.
  ;; =====================================================================
  (type $gardener (resource (rep i32)))

  ;; =====================================================================
  ;; Memory module — owns the shared linear memory and all static data.
  ;; =====================================================================
  (core module $mem-module
    (memory (export "memory") 2)
    (data (i32.const 1024) "together.Nib")
    (data (i32.const 1040) "0.1.0")
    (data (i32.const 1056) "Better Together samples")
    (data (i32.const 1120) "https://github.com/pavelsavara/better-together")
    (data (i32.const 1184) "Nib is the smallest gardener: a single seed, hand-written in raw wasm text. It keeps no memory and bears no grudge - each round it matches the table's promises and adds a little more.")
    (data (i32.const 1408) "\f0\9f\8c\b1")
    (data (i32.const 1600) "nib: i match what you pledge, then plant a little extra.\n")
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; =====================================================================
  ;; Lower the imported WASI functions to core functions.
  ;; =====================================================================
  (alias export $stdout "get-stdout" (func $get-stdout-comp))
  (core func $get-stdout-core (canon lower (func $get-stdout-comp)))

  (alias export $io-streams "[method]output-stream.blocking-write-and-flush" (func $bwf-comp))
  (core func $bwf-core (canon lower (func $bwf-comp) (memory $mem)))

  (core func $drop-os-core (canon resource.drop $output-stream))

  ;; resource.new for the exported gardener (mints a handle from a rep).
  (core func $g-new-core (canon resource.new $gardener))

  ;; =====================================================================
  ;; Implementation core module — the actual bot logic.
  ;; =====================================================================
  (core module $impl
    (import "host" "memory"     (memory 0))
    (import "host" "get-stdout" (func $get-stdout (result i32)))
    (import "host" "bwf"        (func $bwf (param i32 i32 i32 i32)))
    (import "host" "drop-os"    (func $drop-os (param i32)))
    (import "host" "g-new"      (func $g-new (param i32) (result i32)))

    ;; ---- bump allocator for the canonical ABI -------------------------
    (global $heap (mut i32) (i32.const 65536))
    (func $cabi_realloc (export "cabi_realloc")
          (param $old_ptr i32) (param $old_size i32)
          (param $align i32) (param $new_size i32) (result i32)
      (local $ptr i32)
      (local $end i32)
      ;; shrink / in-place: reuse the old block
      (if (i32.and
            (i32.ne (local.get $old_ptr) (i32.const 0))
            (i32.le_u (local.get $new_size) (local.get $old_size)))
        (then (return (local.get $old_ptr))))
      ;; align the heap pointer up to $align
      (local.set $ptr
        (i32.and
          (i32.add (global.get $heap) (i32.sub (local.get $align) (i32.const 1)))
          (i32.xor (i32.sub (local.get $align) (i32.const 1)) (i32.const -1))))
      (local.set $end (i32.add (local.get $ptr) (local.get $new_size)))
      ;; grow memory until $end fits
      (block $done
        (loop $grow
          (br_if $done
            (i32.le_u (local.get $end)
                      (i32.mul (memory.size) (i32.const 65536))))
          (if (i32.eq (memory.grow (i32.const 1)) (i32.const -1))
            (then unreachable))
          (br $grow)))
      (global.set $heap (local.get $end))
      ;; copy old contents when growing an existing block
      (if (i32.ne (local.get $old_ptr) (i32.const 0))
        (then (memory.copy (local.get $ptr) (local.get $old_ptr) (local.get $old_size))))
      (local.get $ptr))

    ;; ---- create() -> result<own<gardener>> ----------------------------
    ;; Mint a handle from a constant rep; return ptr to { disc=0, handle }.
    (func $create (export "create") (result i32)
      (i32.store8 (i32.const 512) (i32.const 0))
      (i32.store  (i32.const 516) (call $g-new (i32.const 0)))
      (i32.const 512))

    ;; ---- metadata() -> result<metadata> -------------------------------
    ;; Build { disc=0, record{ 5 (ptr,len) strings } } in static memory.
    (func $metadata (export "metadata") (param $self i32) (result i32)
      (i32.store8 (i32.const 544) (i32.const 0))
      (i32.store (i32.const 548) (i32.const 1024)) (i32.store (i32.const 552) (i32.const 12))  ;; name "together.Nib"
      (i32.store (i32.const 556) (i32.const 1040)) (i32.store (i32.const 560) (i32.const 5))   ;; version
      (i32.store (i32.const 564) (i32.const 1056)) (i32.store (i32.const 568) (i32.const 23))  ;; author
      (i32.store (i32.const 572) (i32.const 1120)) (i32.store (i32.const 576) (i32.const 46))  ;; repo
      (i32.store (i32.const 580) (i32.const 1184)) (i32.store (i32.const 584) (i32.const 185)) ;; lore
      (i32.store (i32.const 588) (i32.const 1408)) (i32.store (i32.const 592) (i32.const 4))   ;; glyph
      (i32.store8 (i32.const 596) (i32.const 0))                                              ;; icon = none
      (i32.const 544))

    ;; ---- match-start(context) -> result -------------------------------
    ;; Ignore the context; just say "ok" (bare result -> i32 disc by value).
    (func $match-start (export "match-start")
          (param i32 i32 i32 i32 i32 i32 i32 i32) (result i32)
      (i32.const 0))

    ;; ---- talk(state) -> result<signal> --------------------------------
    ;; Print a line of banter, then always broadcast `watch` (enum = 2).
    ;; round-state flattens to: round, history(ptr,len), signals(ptr,len),
    ;; plants(ptr,len). Nib reads none of it here.
    (func $talk (export "talk")
          (param $self i32) (param $round i32)
          (param $hp i32) (param $hl i32) (param $sp i32) (param $sl i32)
          (param $pp i32) (param $pl i32) (result i32)
      (local $h i32)
      (local.set $h (call $get-stdout))
      (call $bwf (local.get $h) (i32.const 1600) (i32.const 59) (i32.const 608))
      (call $drop-os (local.get $h))
      (i32.store8 (i32.const 528) (i32.const 0))   ;; disc = ok
      (i32.store8 (i32.const 529) (i32.const 2))   ;; signal = watch
      (i32.const 528))

    ;; ---- plant(state) -> result<u8> -----------------------------------
    ;; Count `bloom` (enum = 0) broadcasts in state.signals, add 4, clamp 10.
    ;; signal-broadcast layout: { id: (ptr@0,len@4), signal: u8@8 }, stride 12.
    ;; round-state flattens to: round, history(ptr,len), signals(ptr,len),
    ;; plants(ptr,len). Nib reads only the signals list.
    (func $plant (export "plant")
          (param $self i32) (param $round i32)
          (param $hp i32) (param $hl i32) (param $sp i32) (param $sl i32)
          (param $pp i32) (param $pl i32) (result i32)
      (local $i i32) (local $cnt i32) (local $v i32)
      (block $done
        (loop $loop
          (br_if $done (i32.ge_u (local.get $i) (local.get $sl)))
          (if (i32.eqz
                (i32.load8_u
                  (i32.add
                    (i32.add (local.get $sp) (i32.mul (local.get $i) (i32.const 12)))
                    (i32.const 8))))
            (then (local.set $cnt (i32.add (local.get $cnt) (i32.const 1)))))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $loop)))
      (local.set $v (i32.add (local.get $cnt) (i32.const 4)))
      (if (i32.gt_u (local.get $v) (i32.const 10))
        (then (local.set $v (i32.const 10))))
      (i32.store8 (i32.const 536) (i32.const 0))    ;; disc = ok
      (i32.store8 (i32.const 537) (local.get $v))   ;; value = plant count
      (i32.const 536))

    ;; ---- vote(state) -> result<ballot> --------------------------------
    ;; Nib keeps no grudge: always abstain. The return is result<option<
    ;; string>>, laid out at 640 as { result disc u8 @640, option disc u8 @644 }.
    ;; ok + none is just two zero bytes; the string ptr/len are never read.
    (func $vote (export "vote")
          (param $self i32) (param $round i32)
          (param $hp i32) (param $hl i32) (param $sp i32) (param $sl i32)
          (param $pp i32) (param $pl i32) (result i32)
      (i32.store8 (i32.const 640) (i32.const 0))   ;; result disc = ok
      (i32.store8 (i32.const 644) (i32.const 0))   ;; ballot = none (abstain)
      (i32.const 640))

    ;; ---- match-end(summary) -> result ---------------------------------
    (func $match-end (export "match-end")
          (param i32 i32 i32 i32 f32) (result i32)
      (i32.const 0))
  )

  (core instance $host-exports
    (export "memory"     (memory $mem))
    (export "get-stdout" (func $get-stdout-core))
    (export "bwf"        (func $bwf-core))
    (export "drop-os"    (func $drop-os-core))
    (export "g-new"      (func $g-new-core))
  )
  (core instance $core (instantiate $impl
    (with "host" (instance $host-exports))))

  ;; =====================================================================
  ;; Lift the core functions back up to component-level player methods.
  ;; =====================================================================
  (alias core export $core "cabi_realloc" (core func $cabi_realloc))
  (alias core export $core "create"       (core func $create-core))
  (alias core export $core "metadata"     (core func $metadata-core))
  (alias core export $core "match-start"  (core func $match-start-core))
  (alias core export $core "talk"         (core func $talk-core))
  (alias core export $core "plant"        (core func $plant-core))
  (alias core export $core "vote"         (core func $vote-core))
  (alias core export $core "match-end"    (core func $match-end-core))

  (type $fn-metadata    (func (param "self" (borrow $gardener)) (result (result $metadata))))
  (type $fn-match-start (func (param "self" (borrow $gardener)) (param "context" $match-context) (result (result))))
  (type $fn-talk        (func (param "self" (borrow $gardener)) (param "state" $round-state) (result (result $signal))))
  (type $fn-plant       (func (param "self" (borrow $gardener)) (param "state" $round-state) (result (result u8))))
  (type $ballot         (option $player-id))
  (type $fn-vote        (func (param "self" (borrow $gardener)) (param "state" $round-state) (result (result $ballot))))
  (type $fn-match-end   (func (param "self" (borrow $gardener)) (param "summary" $match-summary) (result (result))))
  (type $fn-create      (func (result (result (own $gardener)))))

  (func $metadata-comp (type $fn-metadata)
    (canon lift (core func $metadata-core) (memory $mem) string-encoding=utf8))
  (func $match-start-comp (type $fn-match-start)
    (canon lift (core func $match-start-core) (memory $mem) (realloc $cabi_realloc) string-encoding=utf8))
  (func $talk-comp (type $fn-talk)
    (canon lift (core func $talk-core) (memory $mem) (realloc $cabi_realloc) string-encoding=utf8))
  (func $plant-comp (type $fn-plant)
    (canon lift (core func $plant-core) (memory $mem) (realloc $cabi_realloc) string-encoding=utf8))
  (func $vote-comp (type $fn-vote)
    (canon lift (core func $vote-core) (memory $mem) (realloc $cabi_realloc) string-encoding=utf8))
  (func $match-end-comp (type $fn-match-end)
    (canon lift (core func $match-end-core) (memory $mem) (realloc $cabi_realloc) string-encoding=utf8))
  (func $create-comp (type $fn-create)
    (canon lift (core func $create-core) (memory $mem)))

  ;; =====================================================================
  ;; Export better-together:gardener/player@0.1.0.
  ;;
  ;; The concrete `gardener` resource (with its i32 rep) is needed by the
  ;; canonical ABI lifts above, but the *exported* interface must present the
  ;; resource abstractly. A nested "shim" component launders this: it imports
  ;; the value types, the resource as an opaque `(sub resource)`, and the lifted
  ;; methods, then re-exports them as the public `player` interface. This is the
  ;; same wiring `wit-component` emits for compiled bots.
  ;; =====================================================================
  (component $player-shim
    (type (option string))                                                  ;; 0
    (type (record (field "name" string) (field "version" string)
                  (field "author" string) (field "repo" string) (field "lore" string)
                  (field "glyph" string) (field "icon" 0)))                  ;; 1
    (import "import-type-metadata" (type (eq 1)))                            ;; 2
    (type (enum "bloom" "hold" "watch"))                                    ;; 3
    (import "import-type-signal" (type (eq 3)))                             ;; 4
    (type string)                                                          ;; 5
    (import "import-type-player-id" (type (eq 5)))                          ;; 6
    (type (list 6))                                                        ;; 7
    (type (record (field "match-id" string) (field "players" 7)
                  (field "self-id" 6) (field "group-size" u8)))             ;; 8
    (import "import-type-match-context" (type (eq 8)))                      ;; 9
    (type (record (field "id" 6) (field "plant" u8) (field "signal" 4)))    ;; 10
    (import "import-type-player-action" (type (eq 10)))                     ;; 11
    (type (list 11))                                                        ;; 12  list<player-action>
    (type (option 6))                                                        ;; 13  option<player-id>
    (type (record (field "voter" 6) (field "target" 13)))                   ;; 14  vote-record
    (import "import-type-vote-record" (type (eq 14)))                       ;; 15
    (type (list 15))                                                        ;; 16  list<vote-record>
    (type (record (field "actions" 12) (field "garden-total" u16)
                  (field "votes" 16) (field "tax-target" 13)
                  (field "tax-collected" u8) (field "garden-payout" f32)))   ;; 17  round-result
    (import "import-type-round-result" (type (eq 17)))                      ;; 18
    (type (record (field "id" 6) (field "signal" 4)))                       ;; 19  signal-broadcast
    (import "import-type-signal-broadcast" (type (eq 19)))                  ;; 20
    (type (list 18))                                                        ;; 21  list<round-result>
    (type (list 20))                                                        ;; 22  list<signal-broadcast>
    (type (record (field "round" u8) (field "history" 21)
                  (field "signals" 22) (field "plants" 12)))                ;; 23  round-state
    (import "import-type-round-state" (type (eq 23)))                       ;; 24
    (type (tuple 6 f32))                                                    ;; 25
    (type (list 25))                                                        ;; 26
    (type (record (field "rounds-played" u8) (field "final-scores" 26)
                  (field "your-score" f32)))                                ;; 27
    (import "import-type-match-summary" (type (eq 27)))                     ;; 28
    (import "import-type-gardener" (type (sub resource)))                   ;; 29
    (type (borrow 29))                                                      ;; 30
    (import "import-type-metadata0" (type (eq 2)))                          ;; 31
    (type (result 31))                                                     ;; 32
    (type (func (param "self" 30) (result 32)))                            ;; 33
    (import "import-method-gardener-metadata" (func (type 33)))             ;; 0
    (import "import-type-match-context0" (type (eq 9)))                     ;; 34
    (type (result))                                                        ;; 35
    (type (func (param "self" 30) (param "context" 34) (result 35)))        ;; 36
    (import "import-method-gardener-match-start" (func (type 36)))          ;; 1
    (import "import-type-round-state0" (type (eq 24)))                      ;; 37
    (import "import-type-signal0" (type (eq 4)))                            ;; 38
    (type (result 38))                                                     ;; 39
    (type (func (param "self" 30) (param "state" 37) (result 39)))          ;; 40
    (import "import-method-gardener-talk" (func (type 40)))                 ;; 2
    (type (result u8))                                                     ;; 41
    (type (func (param "self" 30) (param "state" 37) (result 41)))          ;; 42
    (import "import-method-gardener-plant" (func (type 42)))                ;; 3
    (import "import-type-match-summary0" (type (eq 28)))                    ;; 43
    (type (func (param "self" 30) (param "summary" 43) (result 35)))        ;; 44
    (import "import-method-gardener-match-end" (func (type 44)))            ;; 4
    (type (own 29))                                                        ;; 45
    (type (result 45))                                                     ;; 46
    (type (func (result 46)))                                              ;; 47
    (import "import-func-create" (func (type 47)))                          ;; 5
    (type (result 13))                                                     ;; 48  result<ballot> (ballot = option<player-id> = 13)
    (type (func (param "self" 30) (param "state" 37) (result 48)))          ;; 49
    (import "import-method-gardener-vote" (func (type 49)))                ;; 6
    (export "metadata"      (type 2))                                       ;; 50
    (export "signal"        (type 4))                                       ;; 51
    (export "match-context" (type 9))                                       ;; 52
    (export "round-state"   (type 24))                                      ;; 53
    (export "match-summary" (type 28))                                      ;; 54
    (export "ballot"        (type 13))                                      ;; 55
    (export "gardener"      (type 29))                                      ;; 56
    (type (borrow 56))                                                      ;; 57
    (type (result 50))                                                     ;; 58
    (type (func (param "self" 57) (result 58)))                            ;; 59
    (export "[method]gardener.metadata" (func 0) (func (type 59)))
    (type (result))                                                        ;; 60
    (type (func (param "self" 57) (param "context" 52) (result 60)))        ;; 61
    (export "[method]gardener.match-start" (func 1) (func (type 61)))
    (type (result 51))                                                     ;; 62
    (type (func (param "self" 57) (param "state" 53) (result 62)))          ;; 63
    (export "[method]gardener.talk" (func 2) (func (type 63)))
    (type (result u8))                                                     ;; 64
    (type (func (param "self" 57) (param "state" 53) (result 64)))          ;; 65
    (export "[method]gardener.plant" (func 3) (func (type 65)))
    (type (func (param "self" 57) (param "summary" 54) (result 60)))        ;; 66
    (export "[method]gardener.match-end" (func 4) (func (type 66)))
    (type (result 55))                                                     ;; 67  result<ballot>
    (type (func (param "self" 57) (param "state" 53) (result 67)))          ;; 68
    (export "[method]gardener.vote" (func 6) (func (type 68)))
    (type (own 56))                                                        ;; 69
    (type (result 69))                                                     ;; 70
    (type (func (result 70)))                                              ;; 71
    (export "create" (func 5) (func (type 71)))
  )
  (instance $player (instantiate $player-shim
    (with "import-method-gardener-metadata"    (func $metadata-comp))
    (with "import-method-gardener-match-start" (func $match-start-comp))
    (with "import-method-gardener-talk"        (func $talk-comp))
    (with "import-method-gardener-plant"       (func $plant-comp))
    (with "import-method-gardener-vote"        (func $vote-comp))
    (with "import-method-gardener-match-end"   (func $match-end-comp))
    (with "import-func-create"                 (func $create-comp))
    (with "import-type-metadata"         (type $metadata))
    (with "import-type-signal"           (type $signal))
    (with "import-type-player-id"        (type $player-id))
    (with "import-type-match-context"    (type $match-context))
    (with "import-type-player-action"    (type $player-action))
    (with "import-type-vote-record"      (type $vote-record))
    (with "import-type-round-result"     (type $round-result))
    (with "import-type-signal-broadcast" (type $signal-broadcast))
    (with "import-type-round-state"      (type $round-state))
    (with "import-type-match-summary"    (type $match-summary))
    (with "import-type-gardener"         (type $gardener))
    (with "import-type-metadata0"        (type $metadata))
    (with "import-type-match-context0"   (type $match-context))
    (with "import-type-round-state0"     (type $round-state))
    (with "import-type-signal0"          (type $signal))
    (with "import-type-match-summary0"   (type $match-summary))
  ))
  (export "better-together:gardener/player@0.1.0" (instance $player))
)
