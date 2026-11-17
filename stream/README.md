# 24/7 stream from your home server (OpenMediaVault + Docker)

The container opens the game page in Chromium on a virtual screen and streams it with ffmpeg to Kick. It restarts itself if anything breaks and every 6 h to stay clean.

1. Copy this `stream/` folder to the server (e.g. `/srv/neon-stream`).
2. `cp .env.example .env`, then fill in `RTMP_URL` and `STREAM_KEY` from Kick (Dashboard -> Stream Manager -> Stream URL & Key). Keep the key private.
3. `docker compose up -d --build`
4. Logs: `docker logs -f neon-stream`. Stop: `docker compose down`.

Optional: put `.mp3` files in `./music` for looping background music. If the CPU is too weak, lower `FPS=24`, `WIDTH=960 HEIGHT=540`, or add `&bloom=0` to `GAME_URL`.
