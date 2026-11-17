#!/bin/bash
# Renders the game page in Chromium on a virtual screen and streams it with ffmpeg (24/7, auto-restart).
set -u
URL="${GAME_URL:-https://parkour-production-fb0b2708.up.railway.app/chat.html?mute=1&fps=24&lite=1}"
W="${WIDTH:-1280}"; H="${HEIGHT:-720}"; FPS="${FPS:-30}"
VBR="${VIDEO_KBPS:-2500}"
OUT="${RTMP_URL:-}"; KEY="${STREAM_KEY:-}"
CHROME="${CHROME_BIN:-chromium}"
RESTART_HOURS="${RESTART_HOURS:-6}"
if [ -z "$OUT" ]; then echo "Set RTMP_URL (and STREAM_KEY)"; exit 1; fi
case "$OUT" in rtmp*) OUT="${OUT%/}"; case "$OUT" in */app) ;; *) OUT="$OUT/app";; esac; TARGET="$OUT/$KEY"; FMT="flv";; *) TARGET="$OUT"; FMT="${OUT_FMT:-mp4}";; esac
export DISPLAY=:99

while true; do
  echo "[stream] starting session $(date)"
  Xvfb :99 -screen 0 ${W}x${H}x24 -nolisten tcp &
  XPID=$!; sleep 2
  $CHROME --no-sandbox --disable-dev-shm-usage --kiosk --app="$URL" --window-size=$W,$H --window-position=0,0 \
    --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist ${CHROME_EXTRA:-} \
    --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check --disable-infobars --noerrdialogs --hide-scrollbars \
    --user-data-dir=/tmp/chrome-profile >/tmp/chrome.log 2>&1 &
  CPID=$!; sleep 8

  # audio: loop mp3s from /music if present, otherwise silence
  MDIR=/music; ls /music/*.mp3 >/dev/null 2>&1 || MDIR=/music-default
  if ls $MDIR/*.mp3 >/dev/null 2>&1; then
    ls $MDIR/*.mp3 | sed "s/.*/file '&'/" > /tmp/playlist.txt
    AUDIO=(-stream_loop -1 -f concat -safe 0 -i /tmp/playlist.txt)
  else
    AUDIO=(-f lavfi -i anullsrc=r=44100:cl=stereo)
  fi

  if [ "${ENCODER:-x264}" = "vaapi" ]; then
    # Intel iGPU hardware encoding (frees the CPU). Needs /dev/dri in the container.
    VENC=(-vaapi_device /dev/dri/renderD128 -vf "format=nv12,hwupload" -c:v h264_vaapi -b:v ${VBR}k -maxrate ${VBR}k -bufsize $((VBR*2))k)
  else
    VENC=(-c:v libx264 -preset "${X264_PRESET:-veryfast}" -tune zerolatency -b:v ${VBR}k -maxrate ${VBR}k -bufsize $((VBR*2))k -pix_fmt yuv420p)
  fi
  timeout "${RESTART_HOURS}h" ffmpeg -hide_banner -loglevel warning \
    -f x11grab -framerate $FPS -video_size ${W}x${H} -i :99 "${AUDIO[@]}" \
    "${VENC[@]}" -g $((FPS*2)) -c:a aac -b:a 128k -ar 44100 -shortest -f $FMT "$TARGET"
  echo "[stream] ffmpeg stopped ($?), restarting in 5s"
  kill $CPID $XPID 2>/dev/null; sleep 5; pkill -f chrome-profile 2>/dev/null; sleep 2
done
