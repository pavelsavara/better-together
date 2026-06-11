// Pixel-perfect frame slicer for Better Together.
//
// Cuts samples/frame-full.png into a 9-slice-style set of PNGs that can be
// assembled in HTML/CSS to render a responsive ornamental panel frame:
//   - 4 fixed corner pieces (the grapevine flourishes)
//   - tileable edge pieces (background-repeat) for top / bottom / left / right
//   - a fixed bottom-center "button box" piece
//
// The source black background is chroma-keyed to transparency by recovering
// coverage from luminance (alpha = max(r,g,b); RGB un-premultiplied) so the
// violet line-art keeps full color over any panel background.
//
// Usage:
//   node slice-frame.mjs            # produce the slices + previews
//   node slice-frame.mjs --overlay  # only emit a debug overlay of the cut lines

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../samples/frame-full.png');
const OUT = resolve(__dirname, '../web/public/frame');

// ---------------------------------------------------------------------------
// Geometry (pixel coordinates in the 824x830 source). All slices are derived
// from these constants so every piece aligns exactly to its neighbours.
// ---------------------------------------------------------------------------
const GEO = {
    W: 824,
    H: 830,
    // Corner thicknesses. TL/TR share TH; TL/BL share LW; etc. so rails line up.
    LW: 290, // left corners width  -> left rail sits inside this strip
    RW: 290, // right corners width
    TH: 290, // top corners height  -> top rail sits inside this strip
    BH: 235, // bottom corners height
    // Bottom corners are NARROWER than the side strips: they hold only the vine
    // flourish (which ends ~x214) and must NOT reach the button forks (x266+).
    // The plain rail tile + the fixed center(button+forks) piece cover the rest.
    botCornerW: 250,
    // Top edge tile: a thin slice of the top border holding BOTH horizontal
    // rails so they tile across the whole top edge (mirroring the bottom edge,
    // which also has two rails). At x400 the slice captures the outer dashed
    // rail (y~49) and the inner solid rail (y~110..112, the continuous center
    // rule that spans x266..558); the band between them is empty. Height 115
    // reaches just past the inner rail.
    topTile: { x: 400, w: 16, h: 115 },
    // Bottom edge tile: thin slice of pure plain rail (no vine, no fork): the
    // button-level rail (y~741) + bottom border (y~797). x240..256 is clear of
    // the vine (ends ~x214) and the left fork (starts ~x266).
    botTile: { x: 240, w: 16 },
    // Bottom-center piece (fixed, centered): the button box PLUS its two
    // bracket forks (left `}` x266..282, right `{` x547..557). Spanning
    // x266..558 keeps the forks in this non-repeating piece so the rails can
    // tile cleanly up to them. Symmetric about the frame center (412).
    // Interior text ([P]LANT [W]ATER) is erased between the box walls
    // (textLeft..textRight, textTop..textBottom) so HTML text can be overlaid;
    // the forks lie OUTSIDE that band and are preserved.
    button: { x: 266, w: 292, textLeft: 292, textRight: 532, textTop: 719, textBottom: 765 },
    // Left/right edge tiles: one dash period, auto-snapped near vertical center.
    sideSnapY: 400,
};

await mkdir(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// Load source as RGBA and chroma-key black -> transparency.
// ---------------------------------------------------------------------------
const { data: rgba, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
if (W !== GEO.W || H !== GEO.H) {
    console.warn(`WARNING: source is ${W}x${H}, geometry assumes ${GEO.W}x${GEO.H}`);
}

// transparent (premultiply-recovered) buffer
const keyed = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const a = Math.max(r, g, b);
    if (a === 0) {
        keyed[i * 4] = keyed[i * 4 + 1] = keyed[i * 4 + 2] = keyed[i * 4 + 3] = 0;
    } else {
        keyed[i * 4] = Math.min(255, Math.round((r * 255) / a));
        keyed[i * 4 + 1] = Math.min(255, Math.round((g * 255) / a));
        keyed[i * 4 + 2] = Math.min(255, Math.round((b * 255) / a));
        keyed[i * 4 + 3] = a;
    }
}

const keyedSharp = () => sharp(keyed, { raw: { width: W, height: H, channels: 4 } });

// Clear a source-coordinate rectangle to full transparency in the keyed buffer.
function clearRect(x0, y0, x1, y1) {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
            const i = (y * W + x) * 4;
            keyed[i] = keyed[i + 1] = keyed[i + 2] = keyed[i + 3] = 0;
        }
    }
}

async function cut(name, left, top, width, height) {
    left = Math.round(left); top = Math.round(top);
    width = Math.round(width); height = Math.round(height);
    const file = resolve(OUT, name);
    await keyedSharp().extract({ left, top, width, height }).png().toFile(file);
    return { name, left, top, width, height };
}

// ---------------------------------------------------------------------------
// Auto-snap one dash period on a vertical border (for left/right edge tiles).
// Scans an ink band, finds dash starts, returns [startY, periodPx].
// ---------------------------------------------------------------------------
function detectVPeriod(bandX0, bandX1, nearY) {
    const T = 30;
    const on = [];
    for (let y = 0; y < H; y++) {
        let ink = false;
        for (let x = bandX0; x <= bandX1; x++) if (rgba[(y * W + x) * 4] > T || rgba[(y * W + x) * 4 + 2] > T) { ink = true; break; }
        on.push(ink);
    }
    const starts = [];
    for (let y = 1; y < H; y++) if (on[y] && !on[y - 1]) starts.push(y);
    // periods in the regular zone
    const periods = [];
    for (let i = 1; i < starts.length; i++) periods.push(starts[i] - starts[i - 1]);
    periods.sort((a, b) => a - b);
    const period = periods[Math.floor(periods.length / 2)] || 28;
    // start nearest to nearY that is a dash start
    let best = starts[0];
    for (const s of starts) if (Math.abs(s - nearY) < Math.abs(best - nearY)) best = s;
    return { start: best, period };
}

if (process.argv.includes('--overlay')) {
    // Draw red cut lines on the ORIGINAL (opaque) image for visual verification.
    const ov = Buffer.from(rgba); // copy
    const red = (x, y) => { const i = (y * W + x) * 4; ov[i] = 255; ov[i + 1] = 0; ov[i + 2] = 0; ov[i + 3] = 255; };
    const vline = (x) => { for (let y = 0; y < H; y++) red(Math.min(W - 1, Math.max(0, x)), y); };
    const hline = (y) => { for (let x = 0; x < W; x++) red(x, Math.min(H - 1, Math.max(0, y))); };
    vline(GEO.LW); vline(W - GEO.RW);
    hline(GEO.TH); hline(H - GEO.BH);
    vline(GEO.button.x); vline(GEO.button.x + GEO.button.w);
    const file = resolve(OUT, 'frame-overlay.png');
    await sharp(ov, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file);
    console.log('overlay ->', file);
    process.exit(0);
}

// ---------------------------------------------------------------------------
// Produce the slices.
// ---------------------------------------------------------------------------
const { LW, RW, TH, BH, botCornerW, button } = GEO;
const pieces = {};

// Corners. Bottom corners are narrower (vine only, no forks).
pieces.tl = await cut('corner-tl.png', 0, 0, LW, TH);
pieces.tr = await cut('corner-tr.png', W - RW, 0, RW, TH);
pieces.bl = await cut('corner-bl.png', 0, H - BH, botCornerW, BH);
pieces.br = await cut('corner-br.png', W - botCornerW, H - BH, botCornerW, BH);

// Top / bottom edge tiles (rail slices -> tile horizontally)
pieces.top = await cut('edge-top.png', GEO.topTile.x, 0, GEO.topTile.w, GEO.topTile.h);
pieces.bottom = await cut('edge-bottom.png', GEO.botTile.x, H - BH, GEO.botTile.w, BH);

// Left / right edge tiles (one dash period -> tile vertically)
const lp = detectVPeriod(38, 40, GEO.sideSnapY);
const rp = detectVPeriod(783, 785, GEO.sideSnapY);
pieces.left = await cut('edge-left.png', 0, lp.start, LW, lp.period);
pieces.right = await cut('edge-right.png', W - RW, rp.start, RW, rp.period);

// Bottom-center piece (button + both forks, fixed). Erase only the interior
// text between the box walls so HTML can supply the label; rails and the two
// forks are preserved.
clearRect(button.textLeft, button.textTop, button.textRight, button.textBottom);
pieces.button = await cut('center-bottom.png', button.x, H - BH, button.w, BH);

const manifest = {
    source: 'samples/frame-full.png',
    generatedBy: 'scripts/slice-frame.mjs',
    geometry: GEO,
    detected: { left: lp, right: rp },
    pieces,
};
await writeFile(resolve(OUT, 'frame-manifest.json'), JSON.stringify(manifest, null, 2));
console.log('left period', lp, 'right period', rp);
console.log('slices ->', OUT);

// ---------------------------------------------------------------------------
// Raster preview: reassemble the frame at an arbitrary size to verify tiling.
// Only when run with --preview (keeps web/public/frame clean by default).
// ---------------------------------------------------------------------------
if (process.argv.includes('--preview')) {
    await buildPreview(1000, 680, 'frame-preview-1000x680.png');
    await buildPreview(1200, 560, 'frame-preview-1200x560.png');
    console.log('previews written');
}

async function buildPreview(PW, PH, outName) {
    const layers = [];
    const file = (n) => resolve(OUT, n);
    // edges first (so corners overlap them), then corners, then button.
    // top rail -> tile horizontally between corners
    const topW = PW - LW - RW;
    const topTile = await sharp(file('edge-top.png')).toBuffer();
    const nT = Math.ceil(topW / GEO.topTile.w);
    const topStrip = await sharp({ create: { width: nT * GEO.topTile.w, height: GEO.topTile.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(Array.from({ length: nT }, (_, i) => ({ input: topTile, left: i * GEO.topTile.w, top: 0 })))
        .extract({ left: 0, top: 0, width: topW, height: GEO.topTile.h })
        .png().toBuffer();
    layers.push({ input: topStrip, left: LW, top: 0 });
    // bottom rail -> tile horizontally on each side of the centered button.
    // Bottom corners are narrower (botCornerW), so the rails run from there to
    // the button(+forks) piece.
    const botTile = await sharp(file('edge-bottom.png')).toBuffer();
    const buttonLeft = Math.round((PW - button.w) / 2);
    const botLW = buttonLeft - botCornerW;                       // gap left of button
    const botRW = (PW - botCornerW) - (buttonLeft + button.w);   // gap right of button
    async function botStrip(gapW) {
        if (gapW <= 0) return null;
        const n = Math.ceil(gapW / GEO.botTile.w);
        return sharp({ create: { width: n * GEO.botTile.w, height: BH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite(Array.from({ length: n }, (_, i) => ({ input: botTile, left: i * GEO.botTile.w, top: 0 })))
            .extract({ left: 0, top: 0, width: gapW, height: BH })
            .png().toBuffer();
    }
    const bl = await botStrip(botLW); if (bl) layers.push({ input: bl, left: botCornerW, top: PH - BH });
    const br = await botStrip(botRW); if (br) layers.push({ input: br, left: buttonLeft + button.w, top: PH - BH });
    // left/right rails tiled vertically
    const leftTileH = lp.period; const nL = Math.ceil((PH - TH - BH) / leftTileH);
    const leftStripH = nL * leftTileH;
    const leftTile = await sharp(file('edge-left.png')).toBuffer();
    const leftStrip = await sharp({ create: { width: LW, height: leftStripH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(Array.from({ length: nL }, (_, i) => ({ input: leftTile, left: 0, top: i * leftTileH })))
        .png().toBuffer();
    layers.push({ input: leftStrip, left: 0, top: TH });
    const rightTile = await sharp(file('edge-right.png')).toBuffer();
    const rightStrip = await sharp({ create: { width: RW, height: leftStripH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(Array.from({ length: nL }, (_, i) => ({ input: rightTile, left: 0, top: i * leftTileH })))
        .png().toBuffer();
    layers.push({ input: rightStrip, left: PW - RW, top: TH });
    // corners
    layers.push({ input: file('corner-tl.png'), left: 0, top: 0 });
    layers.push({ input: file('corner-tr.png'), left: PW - RW, top: 0 });
    layers.push({ input: file('corner-bl.png'), left: 0, top: PH - BH });
    layers.push({ input: file('corner-br.png'), left: PW - botCornerW, top: PH - BH });
    // button centered on bottom
    layers.push({ input: file('center-bottom.png'), left: Math.round((PW - button.w) / 2), top: PH - BH });

    await sharp({ create: { width: PW, height: PH, channels: 4, background: { r: 10, g: 10, b: 15, alpha: 255 } } })
        .composite(layers)
        .png()
        .toFile(resolve(OUT, outName));
}
