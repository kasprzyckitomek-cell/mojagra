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

WASD – ruch, Shift – bieg, Spacja – skok, R – powrót do checkpointu, V – widok z trzeciej osoby, Esc – kursor.

## Pokoje

Pokój wybierasz w menu albo linkiem `?room=nazwa`. Znajomi i widzowie streamu wchodzą tym samym linkiem i widzą się nawzajem.

## Struktura

- `server.js` – serwer Express + Socket.IO (pokoje, synchronizacja pozycji)
- `public/level.js` – deterministyczny generator poziomu (każdy gracz ma ten sam poziom)
- `public/physics.js` – fizyka gracza (kolizje AABB, coyote time, lód)
- `public/main.js` – render Three.js, kamera, HUD, multiplayer
