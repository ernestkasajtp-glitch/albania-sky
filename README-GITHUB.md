# Albania Sky / Flight Management System

Eksport i kodit aktual nga workspace, jo kopje e databazës apo snapshot i garantuar i VPS.
Përfshin panelin, portalin, API server, mockup-et, bibliotekat, migrimet dhe skriptet.

## GitHub
1. Krijo repository PRIVATE.
2. Çpaketo ZIP-in dhe ngarko përmbajtjen e dosjes, jo ZIP-in vetë.
3. Për ngarkim me Git: git init; git add .; git commit -m "Initial source import"
4. Lidhe me repository-n tënd dhe bëj push.

## Nisja
Kërkohen Node.js dhe pnpm. Ekzekuto `pnpm install`.
Konfiguro databazën PostgreSQL dhe variablat sipas deploy/.env.example
dhe udhëzimeve në deploy/. Mos vendos kredenciale në GitHub.
Skriptet e paketave përmbajnë komandat dev/build.

## Kufizime
Nuk përfshihen .env, databaza me të dhëna, dokumentet e klientëve,
uploads, backups, historiku Git, node_modules, build-et dhe memoriet e agentit.
Konfigurimi .replit është përjashtuar sepse mund të përmbajë vlera private.
Vlera që ngjanin me kredenciale janë zëvendësuar vetëm në këtë eksport
me placeholder (edhe në shembuj/teste). Kodi origjinal nuk është ndryshuar.
Logo dhe asetet statike të versionuara përfshihen.
Ky ZIP nuk mjafton vetëm për të klonuar të dhënat apo konfigurimin live.
Rishiko sigurinë dhe shembujt përpara se repository të bëhet publik.
