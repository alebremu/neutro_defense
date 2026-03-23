# Neutrophil Defense

An educational tower defense game teaching neutrophil immunology to high school biology students. Players place neutrophils inside a blood vessel to phagocytose bacteria before they reach healthy tissue.

## Scientific concepts covered

| Mechanic | Biology |
|---|---|
| Neutrophil placement inside vessel | Intravascular patrolling / rolling on endothelium |
| Phagocytosis (max 2 bacteria) | Physical limit of phagosome formation |
| Digest timer (phagosome arc) | Phagosome–lysosome fusion and bacterial digestion |
| ATP economy | Metabolic cost of immune responses |
| Encapsulated bacteria (wave 4, hp 2) | Capsule-mediated resistance to phagocytosis |
| Tissue health bar | Bystander tissue damage from uncleared infection |
| Wave escalation tips | Bacteraemia, sepsis, cytokine recruitment |

## Planned levels

- **Level 1** *(complete)* — Phagocytosis. Bacteria only.
- **Level 2** — Degranulation. Fungal hyphae too large to engulf; AoE granule bursts damage tissue.
- **Level 3** — NETs. One-shot NETosis towers; chromatin traps slow pathogens but activate platelets.
- **Level 4** — Cytokine storm. Overusing cytokine-signal towers causes friendly fire.

## Running locally

```bash
pip install -r requirements.txt
python app.py
```

Then open http://localhost:5000

## Project structure

```
neutrophil-defense/
├── app.py                  # Flask entry point
├── requirements.txt
├── templates/
│   └── index.html          # Single-page shell
└── static/
    ├── css/
    │   └── style.css
    └── js/
        ├── constants.js    # Wave config, game tuning values, science tips
        ├── entities.js     # mkBact() and mkTower() factory functions
        ├── draw.js         # All canvas rendering (pure functions)
        └── game.js         # Game loop, input, HUD, lifecycle
```

## Tuning difficulty

All difficulty levers are in `static/js/constants.js`:

- `TOWER_COST` — ATP per neutrophil placed
- `START_ATP` — Starting budget
- `DIGEST_REWARD` — ATP returned per digested bacterium
- `DIGEST_TIME` — Ticks to complete digestion (higher = harder)
- `WAVE_CFG` — Per-wave count, spawn interval, speed multiplier, HP
