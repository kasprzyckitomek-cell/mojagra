# Parkour w chmurach

Wieloosobowa gra parkour 3D w przeglądarce (Three.js, Node.js, Socket.IO).
Skacz po blokowych platformach coraz wyżej, zdobywaj checkpointy i dotrzyj na metę.

## Uruchomienie lokalnie

```
npm install
npm start
```

Otwórz http://localhost:3000. Hosting: Railway (zmienną `PORT` ustawia platforma).

## Sterowanie

WASD – ruch, Shift – bieg, Spacja – skok, R – powrót do checkpointu, V – zmiana kamery, M – dźwięk, Esc – kursor.

## Pokoje

Pokój wybierasz w menu albo linkiem `?room=nazwa`. Znajomi i widzowie streamu wchodzą tym samym linkiem i widzą się nawzajem.

## Struktura

- `server.js` – serwer Express + Socket.IO (pokoje, synchronizacja pozycji)
- `public/level.js` – deterministyczny generator poziomu (każdy gracz ma ten sam poziom)
- `public/physics.js` – fizyka gracza (kolizje AABB, coyote time, lód)
- `public/main.js` – render Three.js, kamera, HUD, multiplayer

## Co się dzieje na mapie

- 12 motywów sekcji (łąka, drewno, pustynia, zamek, mech, śnieg, lawa, marmur, kryształy, neon, stacja, złoto) z teksturami i animowanym blaskiem
- dekoracje (drzewa, latarnie, kaktusy, pochodnie, płomienie, kryształy, pierścienie neonowe) i cząsteczki zależne od sekcji
- znikające platformy (od sekcji 5), lód, kryształy do zbierania, dźwięki generowane w przeglądarce
- ptaki, balony, dryfujące chmury, spadające gwiazdy, kurz przy lądowaniu
- parametr testowy `?dbgsection=N` teleportuje do sekcji N

## Tryb "Czat prowadzi postać" (Neon Ascent)
Strona: `/chat.html`. Widzowie głosują komendami na czacie (`!gora !dol !lewo !prawo !czekaj`), co `VOTE_SECONDS` sekund wygrywa najczęstsza i postać rusza o jedną kratkę.
Zmienne: `ADMIN_KEY`, `KICK_WEBHOOK_SECRET`, `KICK_VERIFY`, `VOTE_SECONDS` (8), `EVENT_MINUTES` (15), `PLATFORMS` (240), `MAP_SEED`, `AUTOPLAY`, `DATA_DIR`.
Webhook Kicka: `POST /kick/webhook/<KICK_WEBHOOK_SECRET>`. Admin (nagłówek `x-admin-key`): `POST /admin/event?type=cofniecie|jackpot|blackout|burza|zamrozenie|tarcza|sabotaz`, `/admin/reset`, `/admin/skip`, `/admin/settings`, `/admin/teleport?route=N`, `GET /admin/status`.

2D light version (for weak servers / Raspberry Pi): `/chat2d.html`. Wrong-direction penalty: env `EDGE_FALL=1` (runner falls to the last checkpoint when chat votes toward empty space) or `EDGE_FALL=2` (falls all the way back to the start). Default 0 = just a blocked move.
