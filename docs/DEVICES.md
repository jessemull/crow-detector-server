# Physical devices plan

> **AI agents — read this when:** working on porch clips, feeder hardware, motion/detection upload, `pi/`, or device auth.
> This doc **supersedes** the physical-device sections of `README.md` where they conflict.

---

## Decisions (current)

| Role (API `x-device-id`)                        | Job                                                                         | Hardware plan                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shelter / porch video** (`pi-porch` uploader) | Motion clips → S3 `porch/` → `/porch` Shelter Cam                           | **2× outdoor sealed IP cams** (e.g. Tapo C120/C121): IP66, IR, on-camera motion, **RTSP local**, Tapo Care / vendor cloud **off**, WAN blocked after setup. **Always-on LAN computer** (home laptop/server) pulls RTSP, cuts visit clips, ECDSA-uploads. **Not** CAM008 / COM1708 outdoors. **Not** a Pi CSI camera in a DIY box.                                                                           |
| **Feeder detection video** (`pi-motion` path)   | Visit photos at feeder                                                      | Same class of sealed outdoor cam + same LAN uploader (second camera).                                                                                                                                                                                                                                                                                                                                       |
| **Feeder video** (`pi-feeder`)                  | Dispense proofs and separate animal-visit clips → S3 `feeder/` → Feeder Cam | A sealed RTSP camera that is **not** the porch camera, pulled by `pi/feeder-recorder.py` on a LAN host. The default loop records proofs only (12 seconds from the button). Animal visits use the same motion detector and two-minute join as the shelter: `python3 pi/feeder-recorder.py --visits`. The relay Pi is later hardware and is not in this recorder. The relay box stays closed: no camera hole. |
| **User device** (`pi-user`)                     | LCD / captcha / user photo                                                  | Unchanged / later; not part of porch shelter work.                                                                                                                                                                                                                                                                                                                                                          |

Device id `pi-porch` may still be the ECDSA identity for uploads even if the recorder runs on a laptop, not a Pi.

---

## Porch / shelter stack (end-to-end)

1. Cat enters shelter → camera motion (and IR at night).
2. Camera exposes local RTSP only (no vendor clip cloud).
3. LAN host records one mp4 for the visit (`pi/record-on-motion.py`): a compact change that repeats, joined while the animal returns within two minutes, closed at ten minutes.
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

3. **On the always-on laptop** (Tailscale host `juzu-inui`): install `ffmpeg` + `python3`, clone into `~/Development/crow-detector-server`, place `~/keys/pi-porch-private.pem`, copy `pi/porch.env.example` → `~/porch.env` and fill `PORCH_API_BASE_URL` + `PORCH_RTSP_URL` (`chmod 600`).
4. **Smoke upload:**  
   `cd ~/Development/crow-detector-server && python3 pi/record-on-motion.py --once`  
   Confirm a clip on the API’s Shelter Cam list (api-dev for bring-up).
5. **Daemon:** install `scripts/porch-recorder.service` (paths target `juzu-inui`), `systemctl enable --now porch-recorder`. Prevent host sleep while recording.
6. **SSH from the Mac:** use `~/.ssh/id_ed25519_porch` (Host `juzu-inui` in `~/.ssh/config`). Confirm: `ssh juzu-inui 'echo ok'`.
7. **Ship code from a dev machine:** push the branch, then  
   `DEPLOY_HOST=juzu-inui PORCH_GIT_REF=main ./scripts/deploy-porch-host.sh`  
   (SSH + `git pull` in `~/Development/crow-detector-server` + restart unit). Override with `PORCH_REPO_DIR='~/…'` if the clone path differs — quote so `~` expands on the remote.

Recorder: `pi/record-on-motion.py` (ffmpeg RTSP + software motion; ECDSA `pi-porch`). Helpers/tests: `pi/record_on_motion_lib.py`, `pi/test_record_on_motion_lib.py`.

**Host load note:** one long-lived ffmpeg on the **substream** (`stream2` by default) continuously remuxes short `-c copy` segments to disk **and** emits low-res gray frames. Motion is a compact patch of pixels that changed against a slow background, repeated for a few frames. A change that covers too much of the picture is a light, not an animal. One visit stays open while new motion arrives within two minutes, then the segments are joined once and uploaded. Local disk holds the open visit; AWS only gets the finished file. The feeder camera uses this same detector for animal visits.

## Feeder video bring-up

The feeder camera is a second RTSP source. Do not point it at `PORCH_RTSP_URL` or `PORCH_API_BASE_URL`.

1. Apply `scripts/db-seed/feeder-video.sql` to the API database. Merge deploys the image and does not run the script. Until the tables exist, the feeder routes error.
2. On the LAN host, copy `pi/feeder.env.example` to `~/feeder.env` (`chmod 600`). Set `FEEDER_API_BASE_URL` (bring-up: `https://api-dev.crittercanteen.com`) and `FEEDER_RTSP_URL`. The private key defaults to `~/keys/pi-feeder-private.pem` (`PI_FEEDER_PRIVATE_KEY_PATH` overrides it).
3. Prove RTSP, then `python3 pi/feeder-recorder.py --once` after `POST /feeder/dispense`.
4. Animal visits are not part of that loop. Run `python3 pi/feeder-recorder.py --visits` to watch the feeder camera with the shelter motion detector. `--visit-once` records the next visit and exits. Pass `--dispense-id <uuid>` when that visit belongs to a proof. A visit is uploaded only when classification finds an animal.
5. **Daemon:** install `scripts/feeder-recorder.service` (paths target `juzu-inui`), `systemctl enable --now feeder-recorder`. The unit runs the proof loop. It does not start `--visits`.
6. **Ship code from a dev machine:** push the branch, then  
   `DEPLOY_HOST=juzu-inui FEEDER_GIT_REF=feat/feeder-video ./scripts/deploy-feeder-host.sh`  
   (SSH + `git pull` in `~/Development/crow-detector-server` + restart unit). Same clone as the shelter recorder.
7. Local clips stay in `~/feeder-staging` until the database write succeeds, then a 45-minute sweeper removes anything left behind.

Public `POST /feeder/dispense` and the `feeder/` lifecycle rule in `cloudformation/crow-detector-s3.yaml` need human review before production (`docs/GOVERNANCE.md`). The relay is still out of this recorder.

## Agent rules

- Prefer adapting porch recording to **RTSP → clip → existing ECDSA upload** over new device types.
- New device ids / auth schemes still need governance approval (`docs/GOVERNANCE.md`).
- Client `/porch` UI stays a consumer of the API; no Pi hardware assumptions in the static site.
