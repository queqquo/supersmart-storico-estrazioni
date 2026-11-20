# SuperSmart — Archivio Storico Estrazioni (Repository Esterno)

Repository pubblico dedicato esclusivamente ai file storici ufficiali delle estrazioni per l'app **SuperSmart** ([supersmart-ten.vercel.app](https://supersmart-ten.vercel.app/) / [queqquo/supersmart](https://github.com/queqquo/supersmart)).

## Perché un repository separato?
Mantenere gli storici fuori dal repository applicativo `queqquo/supersmart` impedisce a **Google AI Studio** di caricare ~400 KB di JSON storici nel contesto ad ogni modifica del codice, riducendo drasticamente il consumo di token.

## File presenti
- `data/superenalotto.json` — Storico ufficiale **SuperEnalotto (6/90 + Jolly + SuperStar)** dal 2009 ad oggi.
- `data/winforitalia.json` — Storico ufficiale **Win for Italia Team / Win for Life (6/40 • Ore 20:00)**.

## Aggiornamento automatico e persistente
- **GitHub Actions** (`.github/workflows/sync-draws.yml`): esegue automaticamente ogni notte lo script `scripts/sync-draws.mjs` per raccogliere le nuove estrazioni ufficiali.
- **Aggiornamento dal sito**: tramite la sezione *Archivio Estrazioni* su `supersmart-ten.vercel.app` (API Vercel `/api/draws` + sincronizzazione Cloud Firestore cross-browser/cross-dispositivo).
