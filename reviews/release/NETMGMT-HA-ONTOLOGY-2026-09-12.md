# Home-automation kit ontology (2026-09-12)

## Principle
Categorize by **what the thing fundamentally is** (transport, wireless stack, lighting plant, platform), not by a common demo (“it can turn on a lamp”).

## Anti-patterns fixed
- **X-10 under Lighting** — wrong. X-10 is a general HA transport (lamps + appliances). Primary: `docs/home-automation/transport/x10.md`.

## Primary buckets
1. `transport/` — X-10, Insteon, UPB, KNX/Lutron *systems*, MQTT
2. `wireless/` — Zigbee, Z-Wave, Thread/Matter, Wi‑Fi IoT device stacks
3. `lighting/` — DALI, 0–10V, phase-cut, DMX, Hue/LIFX/Nanoleaf *as lighting ecosystems*, mesh *light profiles* (cross-links only)
4. `platforms/` — Home Assistant, ESPHome, Zigbee2MQTT
5. `runbooks/` — VLAN, lab bring-up

Cross-links encouraged; **primary path** must be the least-wrong bucket.
