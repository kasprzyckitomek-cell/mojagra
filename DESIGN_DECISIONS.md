# Decyzje projektowe

Miejsca, w których specyfikacja zostawiała wybór, i co wybrano.

1. **WebSocket (`ws`) zamiast Colyseus.** Własny, prosty protokół JSON daje pełną kontrolę nad interest managementem (chunki) i nie wymaga schematów. Serwer jest autorytatywny dla wszystkich akcji (zbieranie, walka, crafting, budowanie, ekwipunek).
2. **Ruch gracza: predykcja klienta + walidacja serwera.** Klient liczy ruch i kolizje lokalnie (natychmiastowa reakcja), serwer sprawdza prędkość, granice mapy i wodę i w razie oszustwa odsyła korektę pozycji.
3. **Teren i obiekty generowane deterministycznie z seeda po obu stronach.** Serwer wysyła tylko różnice (ścięte drzewa, zebrane krzaki, budowle). Zapis świata to głównie te różnice – mały rozmiar w bazie.
4. **Zapis jako JSONB w jednej tabeli `worlds`** (stan świata + postacie graczy) zamiast osobnych tabel na chunki. Dla 1–8 graczy na świat to prostsze i wystarczająco szybkie; wersjonowanie przez pole `v`.
5. **Modele proceduralne z prymitywów Three.js** (toon shading, obrys postaci graczy). Każdy model ma stałe ID i punkty zaczepienia (ręka, głowa, plecy), więc można je podmienić na pliki GLB bez zmian w logice.
6. **Dźwięki i muzyka generowane Web Audio** – zero plików audio do licencjonowania.
7. **Ikony przedmiotów = emoji** – czytelne i bez zewnętrznych assetów.
8. **Bazowa prędkość 4,2 m/s** zamiast 3,2 m/s – przy dużych mapach chodzenie było zbyt męczące. Drogi (+30%) i podłogi przyspieszają dodatkowo.
9. **Energia** działa w sieciach: budowle energetyczne w zasięgu 16 m tworzą jedną sieć; jeśli produkcja ≥ zużycie, wszystkie maszyny działają.
10. **Taśmociąg** zrealizowano jako **Podajnik** (przenosi przedmioty z maszyn do najbliższej skrzyni) – pełne taśmy w 3D były zbyt kosztowne na tym etapie.
11. **Ściany** – jedna receptura daje 4 segmenty; nadmiar trafia do „zapasu” i kolejne stawia się bez kosztu.
12. **Jaskinie, łódź, wagoniki i boss morski (Kraken)** przesunięte do kolejnego etapu (patrz CHANGELOG – Plan). Rolę „podziemnych” zasobów przejęła Wiertnica i Kamienny Matkokret.
13. **Symulacja tylko przy graczach**: świat bez graczy jest wstrzymany i po 60 s zwalniany z pamięci (oszczędność kosztów Railway). Stworzenia żyją tylko w promieniu ~110 m od graczy.
14. **Teksty po polsku** bezpośrednio w plikach danych (`shared/data`). Przy dodawaniu innego języka warto je przenieść do `pl.json`/`en.json`.
