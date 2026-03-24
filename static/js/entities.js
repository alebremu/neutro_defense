/**
 * entities.js
 * Factory functions for game entities.
 * All mutable state lives in plain objects — no classes needed at this scale.
 */

/**
 * Create a bacterium for the given wave config.
 * @param {object} cfg - Entry from WAVE_CFG
 * @returns {object} bacterium state
 */
function mkBact(cfg) {
  return {
    x:        -18,
    y:        VY1 + 16 + Math.random() * (VY2 - VY1 - 32),
    speed:    (1.1 + Math.random() * 0.5) * cfg.speedMult,
    phase:    Math.random() * Math.PI * 2,   // flagella wiggle phase offset
    hp:       cfg.hp,
    maxHp:    cfg.hp,
    dead:     false,
    engulfBy: null,   // reference to neutrophil tower currently digesting this
    engulfT:  0,      // ticks since engulf started (for pull-in animation)
  };
}

/**
 * Create a neutrophil tower at (x, y).
 * Moves by chemotaxis — attracted to nearest bacterium, wanders otherwise.
 * @param {number} x
 * @param {number} y
 * @returns {object} tower state
 */
function mkTower(x, y) {
  return {
    x,
    y,
    vx:           0,                          // current velocity x
    vy:           0,                          // current velocity y
    wanderAngle:  Math.random() * Math.PI * 2, // wander direction when idle
    load:         0,           // bacteria currently being digested
    digestTimer:  0,           // ticks remaining until digestion complete
    range:        PHAGO_RANGE,
    hovered:      false,
    flashT:       0,           // ticks of engulf flash glow remaining
    bounceT:      0,           // ticks of bounce flash (used in L2/L3)
  };
}
