FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium xvfb ffmpeg ca-certificates fonts-noto-cjk fonts-noto-color-emoji procps vainfo intel-media-va-driver libgl1-mesa-dri mesa-va-drivers \
 && rm -rf /var/lib/apt/lists/*
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
