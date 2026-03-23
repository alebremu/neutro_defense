// ── Canvas dimensions ──────────────────────────────────────────────
const W = 820;
const H = 360;

// ── Vessel geometry ────────────────────────────────────────────────
const VY1 = 130;   // vessel top y
const VY2 = 230;   // vessel bottom y
const VCY = 180;   // vessel centre y

// ── Economy ────────────────────────────────────────────────────────
const TOWER_COST      = 26;   // ATP to place a neutrophil
const START_ATP       = 60;
const DIGEST_REWARD   = 3;    // ATP returned per bacterium digested
const WAVE_BONUS_BASE = 25;   // ATP awarded on wave clear
const WAVE_BONUS_STEP = 5;    // additional ATP per wave number

// ── Neutrophil ─────────────────────────────────────────────────────
const PATROL_SPEED    = 0.5;  // px per tick
const PATROL_RADIUS   = 60;   // px either side of placement x
const PHAGO_RANGE     = 42;   // engulf radius (px)
const DIGEST_TIME     = 160;  // ticks to digest a full load
const MAX_LOAD        = 2;    // max simultaneous bacteria held

// ── Tissue ─────────────────────────────────────────────────────────
const TISSUE_START    = 100;
const ESCAPE_DAMAGE   = 8;    // tissue HP lost per escaped bacterium

// ── Wave definitions ───────────────────────────────────────────────
// Each entry: { count, interval (frames), speedMult, hp }
const WAVE_CFG = [
  { count: 18, interval: 28, speedMult: 1.00, hp: 1 }, // wave 1
  { count: 28, interval: 18, speedMult: 1.35, hp: 1 }, // wave 2
  { count: 55, interval:  9, speedMult: 1.85, hp: 1 }, // wave 3
  { count: 90, interval:  5, speedMult: 2.40, hp: 2 }, // wave 4 — encapsulated
];

// ── Science tips ───────────────────────────────────────────────────
const TIPS = {
  place:       { t: 'Extravasation',        b: 'Neutrophils squeeze through vessel walls via diapedesis — here they stay intravascular, scanning the bloodstream.' },
  phago:       { t: 'Phagocytosis',         b: 'Pseudopods wrap around the bacterium, forming a sealed phagosome vacuole inside the cell.' },
  digest:      { t: 'Phagosome maturation', b: 'Lysosomes fuse with the phagosome, releasing enzymes that break down the bacteria. The neutrophil can phagocytose again!' },
  wave2:       { t: 'Increased virulence',  b: 'Faster-replicating bacteria produce larger inocula, overwhelming neutrophil clearance rates.' },
  wave3:       { t: 'Sepsis warning',       b: 'When bacteria outnumber clearance capacity they spill into tissue — triggering systemic inflammation.' },
  wave4:       { t: 'Bacteraemia',          b: 'Wave 4 bacteria have thicker capsules — requiring multiple phagocytic contacts before engulfment.' },
};
