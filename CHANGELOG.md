# Changelog

## 0.1.0 – pierwsza grywalna wersja

**Zrobione (etapy 1–11 z planu, w wersji podstawowej):**
- Fundament: serwer HTTP + WebSocket, build esbuild, Dockerfile, healthcheck `/health`, `railway.json`, zapis przy SIGTERM i autozapis co 3 min.
- Świat: proceduralna wyspa z seeda, 3 rozmiary, 8 biomów + ruiny, POI, mgła wojny, minimapa i mapa.
- Przetrwanie: zdrowie, głód, poczytalność (cienie przy niskiej), temperatura, wilgotność, ciemność, psucie, duchy i wskrzeszanie, tryby Relaks/Normalny/Hardcore.
- Postacie: 6 postaci z perkami, animacje proceduralne, ekwipunek widoczny na modelu, warianty strojów.
- Stoły i budowanie: 9 stołów, ulepszenie Kuźni, receptury z dwoma stołami, plany, prototypowanie, podgląd budowy, ściany, bramy, podłogi, farmy, pożary.
- Stworzenia: 20+ gatunków z AI, najazdy ogarów, 6 bossów z umiejętnościami.
- Konta i persystencja: logowanie/rejestracja (scrypt + token HMAC), goście, PostgreSQL lub pliki.
- Questy: samouczek, 6 aktów fabuły, wioska, postacie, odkrywanie, cel serwera, codzienne zlecenia, osiągnięcia.
- Pory roku i pogoda: 4 pory, deszcz, burze, śnieg, burze piaskowe, pełnia.
- Maszyny: energia, 14 maszyn, golem roboczy.
- Szlif: proceduralne audio, efekty cząsteczkowe, oświetlenie dynamiczne, ustawienia grafiki.

**Jak przetestować:** `npm test` (testy jednostkowe) i uruchomienie gry lokalnie; komendy admina (`/give`, `/time`, `/season`, `/spawn`) pozwalają szybko sprawdzić późniejsze etapy.

**Znane ograniczenia / Plan na kolejne wersje:**
- Jaskinie jako osobna warstwa podziemna.
- Łódź i boss morski, wagoniki i tory.
- Obsługa pada i zmiana klawiszy.
- Modele GLB zamiast proceduralnych (system jest na to przygotowany).
- Tłumaczenie na angielski.
