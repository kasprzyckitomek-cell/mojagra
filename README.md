# Wiecznomrok (Everdusk)

Kooperacyjna gra survival 3D w przeglądarce, inspirowana *Don't Starve Together*, ale z własnym światem, postaciami i mechanikami. Zbierajcie zasoby, budujcie bazę, odblokowujcie stoły rzemieślnicze i maszyny, przetrwajcie noce, pory roku, najazdy ogarów i bossów – razem z przyjaciółmi.

## Co jest w grze

- **Multiplayer 1–8 graczy** na serwer autorytatywny (WebSocket), lobby z listą światów, kody zaproszeń, hasła, konta lub gra jako gość.
- **Proceduralna wyspa** (mała 768 m, średnia 1536 m, duża 2560 m) z 8 biomami + ruinami, ~27 tys. obiektów na średniej mapie, wioska Chrumków, kamienne kręgi, kapliczki, wraki, notatki, legowiska bossów.
- **6 grywalnych postaci** z zaletami i wadami (np. Wilczyca Ruda zmienia się w wilka w pełnię), 3 warianty stroju odblokowywane osiągnięciami.
- **Przetrwanie**: zdrowie, głód, poczytalność, temperatura, wilgotność, zabójcza ciemność, psucie jedzenia, śmierć jako duch i wskrzeszanie.
- **Dzień/noc, 4 pory roku, pogoda** (deszcz, burze z piorunami, śnieg, burze piaskowe), pełnia księżyca.
- **~120 receptur i 9 stołów rzemieślniczych**: Warsztat → Kuźnia (I/II) → Kuchnia, Krosno, Pracownia Alchemika, Stół Kartografa, Warsztat Mechanika → Ołtarz Cienia → Starożytny Rdzeń. Receptury wymagające dwóch stołów naraz, plany (blueprinty) z questów i bossów, receptury unikalne dla postaci.
- **Maszyny i energia**: generator, wiatrak, koło wodne, panel kryształowy, piec hutniczy, tartak, wiertnica, kombajn, zraszacz, wieżyczka, lampy, lodówka, podajnik, golem roboczy.
- **20+ stworzeń i 6 bossów** (Królowa Pająków, Mroźnorożec, Burzogawędź, Piaskowy Tytan, Kamienny Matkokret, Strażnik Rdzenia) z telegrafowanymi atakami.
- **Questy**: samouczek, 6 aktów fabuły ze zakończeniem, questy postaci, zadania od Wodza wioski, odkrywanie, cel całego serwera (wieża sygnałowa), codzienne zlecenia z tablicy.
- Budowanie z podglądem, ściany, bramy, podłogi przyspieszające ruch, farmy, pożary, ochrona baz.
- Mapa z mgłą wojny (wspólna po zbudowaniu Stołu Kartografa), minimapa, pingi, czat, emotki, osiągnięcia.

## Uruchomienie lokalnie

Wymagany Node.js 20+.

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

Tryb deweloperski: `npm run dev` (przebudowuje przy zmianach) i w drugim terminalu `npm start`.
Testy: `npm test`.

Bez `DATABASE_URL` świat zapisuje się do plików w `./data`.

## Wdrożenie na Railway krok po kroku

1. Załóż projekt na [railway.com](https://railway.com) → **New Project**.
2. Dodaj bazę: **+ Create → Database → PostgreSQL**.
3. Dodaj grę: **+ Create → GitHub Repo** i wybierz to repozytorium (gałąź z grą). Railway sam wykryje `Dockerfile` i `railway.json` (healthcheck `/health`).
4. W zakładce **Variables** usługi gry ustaw:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET` = `${{secret(48)}}`
   - `ADMIN_PASSWORD` = dowolne hasło (komenda `/admin <hasło>` w grze)
5. **Settings → Networking → Generate Domain** – dostajesz publiczny adres `https://...up.railway.app`.
6. Gotowe. Każdy push na gałąź wdraża nową wersję. Przy restarcie serwer dostaje `SIGTERM` i zapisuje wszystkie światy przed wyłączeniem; dodatkowo autozapis co 3 minuty.

## Sterowanie

| Akcja | Klawisz |
| --- | --- |
| Ruch | WASD / strzałki |
| Podejdź i użyj (zetnij, zbierz, atakuj, otwórz) | LPM na obiekcie |
| Idź w miejsce | LPM na ziemi |
| Zbierz najbliższą rzecz | Spacja |
| Atakuj najbliższego wroga | F |
| Wymuś atak / akcja alternatywna | Shift + LPM |
| Obrót kamery / zoom | Q, E / kółko myszy |
| Crafting / mapa / questy / pomoc | C / M / J / H |
| Użyj slotu | 1–9 lub PPM na przedmiocie |
| Czat / emotki / lista graczy | Enter / B / Tab |
| Ping na mapie | klik kółkiem |
| Ustawienia | Esc |
| Panel debug | F3 |

## Komendy administratora

Twórca świata jest jego administratorem. Inni mogą wpisać `/admin <ADMIN_PASSWORD>`.
`/give <przedmiot> [ilość]`, `/spawn <potwór>`, `/time day|dusk|night|+<dni>`, `/season autumn|winter|spring|summer`, `/god`, `/heal`, `/tp <x> <z>`, `/reveal`, `/kick <nick>`, `/save`. Dla wszystkich: `/help`, `/where`, `/seed`, `/kill`.

## Struktura projektu

```
shared/        kod wspólny klienta i serwera
  world.ts       generator świata (teren, biomy, obiekty, POI)
  env.ts         czas, pory dnia i roku
  data/          dane gry: items, recipes, structures, mobs, quests, characters, objects
server/        serwer autorytatywny (Node.js + ws)
  index.ts       HTTP, API kont/światów, WebSocket, zapis przy SIGTERM
  world.ts       symulacja świata (tick 20 Hz), przetrwanie, snapshoty, zapis
  actions.ts     akcje graczy, crafting, budowanie, ekwipunek, czat/komendy
  mobs.ts        AI stworzeń, bossowie, spawnery
  machines.ts    maszyny, energia, farmy, kuchnia
  quests.ts      silnik questów
  store.ts       PostgreSQL / pliki JSON
client/        klient Three.js
  game.ts        pętla gry, sterowanie, kamera, światło
  terrain.ts     teren i instancjonowane obiekty
  entities.ts    gracze, stworzenia, budowle, animacje
  models.ts      proceduralne modele low-poly
  ui.ts          interfejs
  audio.ts       proceduralne dźwięki i muzyka
public/        index.html, style.css
tests/         testy jednostkowe
```

Wszystkie dane balansu (przedmioty, receptury, potwory, questy) są w `shared/data/` – zmiana nie wymaga ruszania logiki.
