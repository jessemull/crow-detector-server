# Physical devices plan

> **AI agents — read this when:** working on porch clips, feeder hardware, motion/detection upload, `pi/`, or device auth.
> This doc **supersedes** the physical-device sections of `README.md` where they conflict.

---

## Decisions (current)

| Role (API `x-device-id`) | Job | Hardware plan |
| ------------------------ | --- | ------------- |
| **Shelter / porch video** (`pi-porch` uploader) | Motion clips → S3 `porch/` → `/porch` Shelter Cam | **2× outdoor sealed IP cams** (e.g. Tapo C120/C121): IP66, IR, on-camera motion, **RTSP local**, Tapo Care / vendor cloud **off**, WAN blocked after setup. **Always-on LAN computer** (home laptop/server) pulls RTSP, cuts visit clips, ECDSA-uploads. **Not** CAM008 / COM1708 outdoors. **Not** a Pi CSI camera in a DIY box. |
| **Feeder detection video** (`pi-motion` path) | Visit photos at feeder | Same class of sealed outdoor cam + same LAN uploader (second camera). |
| **Feeder control** (`pi-feeder`) | Relay / dispense on API status | **Raspberry Pi** (e.g. Zero 2 W) + relay in a **cheap IP65 box**, glands for power + feeder wires only. No camera hole. Official PSU: brick outside or silicone-seal oversized gland + drip loop. |
| **User device** (`pi-user`) | LCD / captcha / user photo | Unchanged / later; not part of porch shelter work. |

Device id `pi-porch` may still be the ECDSA identity for uploads even if the recorder runs on a laptop, not a Pi.

---

## Porch / shelter stack (end-to-end)

1. Cat enters shelter → camera motion (and IR at night).
2. Camera exposes local RTSP only (no vendor clip cloud).
3. LAN host records a short mp4 (visit length / cooldown — same idea as `pi/record-on-motion.py`).
4. Host signs and uploads via existing porch URL API → S3 → public `/porch` list.

**Do not** invent outdoor Pi camera enclosures, clear-box IR builds, or “buy another CSI module” for this path.

---

## Shelter hardware (porch)

- K&H **Heated A-Frame** outdoor cat house (compact, two flap exits) on **covered** porch.
- Straw optional; **no food inside** the shelter (feed separately).
- One Tapo (or equivalent) aimed at an entrance; invisible IR preferred; power + heated-pad outlets on the porch.

---

## Deprecated for outdoor video

- Pimoroni **CAM008** night-vision board
- Bare **COM1708** PIR in a project box
- Waterproof “Pi camera cans” for those modules
- Vendor cloud subscriptions as the archive of record

Keep bare Pi camera / PIR parts for indoor experiments only.

---

## Agent rules

- Prefer adapting porch recording to **RTSP → clip → existing ECDSA upload** over new device types.
- New device ids / auth schemes still need governance approval (`docs/GOVERNANCE.md`).
- Client `/porch` UI stays a consumer of the API; no Pi hardware assumptions in the static site.
