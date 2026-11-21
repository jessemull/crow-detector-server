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

## First camera bring-up (LAN host)

1. **Tapo app:** join LAN Wi‑Fi, leave Privacy Mode **off**, skip Tapo Care, prefer invisible IR, create **Camera Account** (Advanced Settings). Optional: static IP + router WAN block after RTSP works.
2. **Prove RTSP** from any LAN machine (do not paste passwords into chat/shell history if avoidable — VLC GUI is fine):

   `rtsp://CAMERA_USER:CAMERA_PASS@CAMERA_IP:554/stream1`

3. **On the always-on laptop:** install `ffmpeg` + `python3`, clone `crow-detector-server`, place `~/keys/pi-porch-private.pem`, copy `pi/porch.env.example` → `~/porch.env` and fill `PORCH_API_BASE_URL` + `PORCH_RTSP_URL` (`chmod 600`).
4. **Smoke upload:**  
   `python3 pi/record-on-motion.py --once`  
   Confirm a clip on the API’s Shelter Cam list (api-dev for bring-up).
5. **Daemon:** install `scripts/porch-recorder.service` (edit User/paths), `systemctl enable --now porch-recorder`. Prevent host sleep while recording.
6. **Ship code from a dev machine:** push the branch, then  
   `DEPLOY_HOST=user@lan-host ./scripts/deploy-porch-host.sh`  
   (SSH + `git pull` + restart unit — same idea as nextdoor’s laptop deploy).

Recorder: `pi/record-on-motion.py` (ffmpeg RTSP + software motion; ECDSA `pi-porch`). Helpers/tests: `pi/record_on_motion_lib.py`, `pi/test_record_on_motion_lib.py`.

**Host load note:** motion sampling starts a short-lived `ffmpeg` process per frame. That is intentional for bring-up simplicity. If the laptop shows high CPU or flaky RTSP reconnects, replace `grab_gray_frame` with a longer-lived sampler later.

## Agent rules

- Prefer adapting porch recording to **RTSP → clip → existing ECDSA upload** over new device types.
- New device ids / auth schemes still need governance approval (`docs/GOVERNANCE.md`).
- Client `/porch` UI stays a consumer of the API; no Pi hardware assumptions in the static site.
