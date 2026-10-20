# Starhold — dizajn (Faza 1: web, svemirska tema)

Datum: 2026-10-20 · Status: odobren
Radni naziv: **Starhold** (konačno ime + provjera zaštitnih znakova prije objave)

## 1. Cilj i kontekst

**Što je korisnik rekao:**
- Online board igra, miks Catana (resursi, gradnja, trgovina) i Riska (vojska, osvajanje, kockice).
- Igra se s prijateljima online, a igru se može dati drugima da igraju bez autora.
- Uživo multiplayer + botovi koji popunjavaju mjesta.
- Platforme: web → mobitel → desktop (tim redom, svaka faza zaseban spec).
- Tri teme kao tri aplikacije: **svemir (prvi)**, srednji vijek, pirati — jedan motor, tematski paketi.
- 2–4 igrača, 30–45 min. Jezici: engleski + hrvatski. Bez računa u v1.
- Kod na GitHub (`toma1203`), "publish ready" na kraju.

**Pretpostavke (potvrđeno ili odlučeno u razgovoru):**
- Ne koristimo imena, grafiku ni tekst pravila Risk/Catan — vlastito ime, grafika i pravila.
- Prva verzija nema baze podataka; sobe žive u memoriji servera (restart servera prekida partije — prihvatljivo za v1, dokumentirano).
- Grafika je vlastita (SVG), zvukovi se sintetiziraju u pregledniku (WebAudio) — nema licenciranih asseta.

**Uspjeh Faze 1:**
1. Netko otvori link, upiše nadimak, napravi sobu, doda botove ili pošalje link prijateljima i odigra cijelu partiju do pobjednika — na računalu i na mobitelu (≥360 px).
2. Igrač koji se odspoji vrati se na svoje mjesto; dok ga nema, igra bot.
3. Igra je deployana na javni URL, s README-om, pravilima u igri, izjavom o privatnosti i CI-jem.

**Izvan opsega Faze 1:** računi/profili, asinkrona igra, razvojne karte, ceste, tekstualni chat (moderacija), gledatelji, teme srednji vijek/pirati (dolaze nakon), mobilni/desktop buildovi.

## 2. Pravila igre

### 2.1 Ploča
- Heksagonalna mreža **sektora** (axial koordinate).
  - 2 igrača: heksagon radijusa 2 = **19 sektora**.
  - 3–4 igrača: heksagon radijusa 3 bez 6 kutnih polja = **31 sektor**.
- Vrste sektora: **resursni** (jedan od 4 resursa + broj 2–12, bez 7), **maglica** (ne proizvodi, ali je teritorij), **matični** (po jedan po igraču).
- Središnje polje je uvijek maglica. Ukupno maglica: 1 (2p) / 2 (3–4p).
- **Trgovačke stanice:** 2 (2p) / 3 (3–4p) resursna sektora označena kao stanica (i dalje proizvode).
- Generator mape (seedan): resursi raspoređeni ravnomjerno (razlika ≤1 među vrstama), brojevi se ponavljaju ciklički iz niza `[2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12]`, **6 i 8 nikad susjedni**, matični sustavi međusobno jednako udaljeni (simetrične pozicije na rubu), nijedan matični sustav nije susjedan drugom.

### 2.2 Resursi
⚙️ Metal · ⚡ Energija · 💎 Kristali · 🌱 Biomasa. Ruka igrača je skrivena drugima (vide samo ukupni broj karata).

### 2.3 Početak
- Svaki igrač: matični sustav = kolonija s **3 flote**, plus po 1 od svakog resursa.
- Redoslijed igrača nasumičan (seedan).
- Matični sustav **ne može biti napadnut** → nema eliminacije.
- Matični sustav ne ovisi o kockicama: **na početku svakog svog poteza** igrač dobiva **1 resurs po izboru** (UI nudi 4 gumba; na isteku vremena ili kod bota bira se resurs kojeg igrač ima najmanje).

### 2.4 Tijek poteza
Faze: `ROLL → (PIRATES ako je 7) → MAIN → FORTIFY → kraj`.

1. **ROLL** — aktivni igrač baca 2k6 (server).
   - Zbroj ≠ 7: svaki sektor s tim brojem bez pirata proizvodi vlasniku: zauzeti sektor **1**, kolonija **2**, baza **2**.
   - Zbroj = 7 (**pirati**): svi igrači s >7 karata odbacuju pola (zaokruženo dolje) — svi biraju istovremeno, 30 s, inače nasumično. Zatim aktivni igrač pomiče piratski brod na bilo koji ne-matični sektor (ne može ostati na istom) i krade 1 nasumičnu kartu od vlasnika tog sektora, ako vlasnik postoji i nije on sam. Sektor s piratom ne proizvodi.
2. **MAIN** — bilo kojim redom, koliko god puta:
   - **Trgovina s bankom:** 4 ista → 1 bilo koji; 3:1 ako igrač posjeduje sektor trgovačke stanice.
   - **Trgovina s igračima:** aktivni igrač objavi ponudu (daje X, traži Y); ostali prihvate ili odbiju; aktivni igrač potvrdi s jednim od prihvatitelja. Ponuda vrijedi do novog poteza ili dok ju ne povuče. Samo aktivni igrač predlaže.
   - **Gradnja:**
     | Što | Cijena | Učinak |
     |---|---|---|
     | Flota | ⚙️+⚡ | +1 flota u bilo kojem vlastitom sektoru |
     | Kolonija | ⚙️+⚡+💎+🌱 | zauzeti sektor → kolonija (+1 bod, proizvodi 2) |
     | Zvjezdana baza | 3⚙️+2💎 | kolonija → baza (+1 bod, ukupno 2; obrana +1) |
   - **Širenje:** iz vlastitog sektora s ≥2 flote premjesti N flota (1 ≤ N ≤ flote−1) u susjedni sektor bez vlasnika (resursni ili maglica) → sektor postaje tvoj (zauzet).
   - **Napad:** iz vlastitog sektora s ≥2 flote na susjedni protivnički (ne-matični) sektor.
     - Napadač bira 1..min(3, flote−1) kockica; branitelj automatski baca min(2, flote) kockica.
     - Branitelj u **bazi** dodaje +1 na svoju najvišu kockicu.
     - Sortirane kockice uspoređuju se u parovima; veća pobjeđuje, **izjednačenje dobiva branitelj**; gubitnik para gubi 1 flotu.
     - Ako branitelj ostane bez flota: napadač osvaja sektor i premješta između (broj bačenih kockica) i (flote−1) flota (UI nudi klizač, zadano maksimum).
     - Osvojena **kolonija prelazi napadaču** s bodom; osvojena **baza pada na koloniju**.
     - Prvo osvajanje protivničkog sektora u potezu: napadač krade 1 nasumičnu kartu od branitelja.
     - Napadi se mogu ponavljati i nizati (flote koje su ušle mogu napadati dalje).
   - Svaki vlastiti sektor mora uvijek imati ≥1 flotu.
3. **FORTIFY** (opcionalno, jednom) — premjesti flote iz jednog vlastitog sektora u drugi povezan preko vlastitih sektora (ostavi ≥1). Ova akcija ili "Završi potez" završava potez.

### 2.5 Bodovi i pobjeda
- Kolonija 1, baza 2 (matični sustav je kolonija → svatko kreće s 1 bodom).
- **Najveće carstvo** (+2): igrač s najviše sektora, najmanje 5. Prvi ga dobiva kad strogo vodi; drugi ga preuzima tek kad strogo prestigne nositelja; ako nositelj padne ispod 5 ili ga netko prestigne, prelazi/nestaje.
- **Ratni vođa** (+2): prvi s 3 osvojena protivnička sektora (širenje u prazno se ne broji); drugi ga preuzima kad strogo prestigne nositelja.
- **Cilj** (postavka sobe): **6 / 8 (zadano) / 10** bodova.
- Pobjeda: čim aktivni igrač nakon bilo koje akcije ima ≥ cilj. Igrač koji dosegne cilj izvan svog poteza pobjeđuje na početku svog poteza ako ga još ima.
- Sigurnosni limit: nakon **60 rundi** pobjeđuje igrač s najviše bodova (izjednačenje: više sektora, pa više flota).

### 2.6 Online pravila
- **Timer poteza:** 90 s (postavka: 60/90/120). Na isteku bot odigra ostatak poteza.
- Dva uzastopna isteka ili prekid veze → igrač je **AFK**; bot igra njegove poteze dok se ne vrati (bilo koja akcija ili reconnect).
- **Botovi:** *Lagani* (nasumičan legalan potez s osnovnim filtrima) i *Normalni* (heuristička ocjena poteza). Botovi odgovaraju na trgovinu prema svojoj procjeni vrijednosti.

## 3. Arhitektura

pnpm monorepo, TypeScript (strict) svuda, Node 22.

```
starhold/
├── packages/
│   ├── engine/     pravila igre — čiste funkcije, bez I/O
│   ├── bots/       AI igrači, ovise samo o engine
│   ├── protocol/   zod sheme i tipovi poruka klijent↔server
│   └── i18n/       EN/HR prijevodi (ključ → tekst), interpolacija
├── themes/
│   └── space/      podaci teme: nazivi, boje, SVG ikone, zvučni efekti
└── apps/
    ├── server/     Node + Socket.IO + statičko posluživanje web builda
    └── web/        React + Vite klijent
```

### 3.1 `engine`
- `createGame(settings, seed): GameState` — mapa, igrači, početno stanje.
- `applyAction(state, playerId, action): { state, events } | { error }` — jedini način promjene stanja; nemutirajući.
- `legalActions(state, playerId)` — za UI (što je klikabilno) i botove.
- `viewFor(state, playerId)` — filtrirani pogled (skriva tuđe karte i seed).
- RNG: seedani PRNG (npr. mulberry32) čije je stanje dio `GameState` → partije su ponovljive.
- Moduli: `map/` (hex geometrija, generator), `rules/` (po jedna datoteka po akciji), `scoring.ts`, `rng.ts`, `types.ts`.

### 3.2 `bots`
- `chooseAction(view, playerId, level): Action` — vidi samo ono što vidi i igrač (`viewFor`), ne vara.
- Normalni: ocjenjuje kandidate (bodovi, očekivana proizvodnja po vjerojatnosti broja, sigurnost granica, šansa pobjede u bitci po tablici). Ograničenje vremena 200 ms po odluci.

### 3.3 `server`
- Sobe u memoriji: kod od 5 znakova (abeceda bez 0/O/1/I/L).
- Životni ciklus sobe: `LOBBY → IN_GAME → FINISHED` (revanš vraća u LOBBY s istim igračima).
- Domaćin = prvi igrač; ako ode, domaćin postaje sljedeći čovjek.
- Svaki igrač dobiva `playerToken` (nasumičnih 128 bita) koji klijent sprema u `localStorage`; reconnect = `{roomCode, playerToken}`.
- Timer i AFK logika na serveru; botovi rade na serveru s malom odgodom (0,6–1,2 s) da potezi budu čitljivi.
- Čišćenje: soba bez spojenih ljudi briše se nakon 30 min; završena nakon 15 min.
- Limiti: max 500 soba, max 4 mjesta, 20 poruka/s po socketu, nadimak 1–20 znakova (trim, bez kontrolnih znakova).
- HTTP: `GET /healthz`, statički web build, sigurnosna zaglavlja (helmet), CSP.

### 3.4 `web`
- Ekrani: **Početna** (nadimak, Kreiraj / Uđi s kodom) → **Lobby** (igrači, dodaj/ukloni bota + razina, postavke cilja i timera, "Kopiraj link") → **Igra** → **Kraj** (pobjednik, statistika, Revanš).
- Ekran igre: SVG mapa (zoom/pan, dodir), panel resursa, akcijski gumbi samo za legalne akcije, dijalozi za trgovinu/napad/odbacivanje, log događaja, timer, lista igrača s bodovima.
- Stanje: Zustand store; server je izvor istine, klijent samo prikazuje `viewFor` i šalje akcije.
- Pristupačnost: navigacija tipkovnicom, boje igrača sigurne za daltoniste + oblik/uzorak po igraču, `prefers-reduced-motion`.
- PWA manifest + ikone, Open Graph tagovi za lijep pregled linka, stranica "Pravila", "Privatnost", "Zasluge".
- Jezik: automatski iz preglednika (hr → HR, ostalo → EN), ručni prekidač.

### 3.5 `themes/space`
Objekt teme: `{ id, name, resources: {metal, energy, crystal, biomass → naziv/ikona/boja}, units: {fleet, colony, starbase, pirate}, palette, sectorArt, sfx }`. Engine koristi samo neutralne ključeve; tema daje prikaz. Kasnije teme dodaju vlastiti objekt bez promjena enginea.

## 4. Tok podataka

```
klijent ──(game:action {type, ...})──▶ server
server: zod validacija → engine.applyAction → ako greška: emit error samo pošiljatelju
                                            → ako OK: novo stanje, events
server ──(game:state {version, view})──▶ svaki igrač svoj viewFor
server ──(game:events [...])──────────▶ svima (filtrirano, npr. tko je što ukrao vide samo uključeni)
```

- Poruke klijent→server: `room:create`, `room:join`, `room:rejoin`, `room:leave`, `room:settings`, `room:addBot`, `room:removeBot`, `room:start`, `room:rematch`, `game:action`.
- Poruke server→klijent: `room:state`, `game:state`, `game:events`, `error {code, messageKey}`.
- Šalje se cijeli filtrirani pogled (nekoliko KB) uz rastući `version`; klijent ignorira starije verzije. Jednostavnije i otpornije od diffova.

## 5. Greške i rubni slučajevi
- Nedozvoljen potez → `error` s i18n ključem; stanje se ne mijenja; UI to prikaže kao toast.
- Prekid veze → Socket.IO automatski reconnect; po povratku `room:rejoin` vrati puno stanje. Nakon 3 neuspjela pokušaja UI nudi "Pokušaj ponovno".
- Nepoznata/istekla soba → poruka i povratak na početnu.
- Soba puna / igra već počela → ulazak odbijen, osim uz važeći token (rejoin).
- Server restart → partije se gube; klijent prikaže "Server je ponovno pokrenut, partija je prekinuta".
- Iznimka u engineu/botu → hvata se po sobi, logira, bot povlači "Završi potez" kao sigurnu akciju; soba ne ruši server.
- React error boundary s gumbom "Učitaj ponovno".

## 6. Testiranje
- **engine:** Vitest unit testovi po pravilu (proizvodnja, pirati, borba, bodovi, nagrade); generator mape (invarijante: broj sektora, 6/8 nesusjedni, simetrija); **property testovi** (fast-check): tisuće nasumičnih partija bot-vs-bot do kraja bez iznimke, uz invarijante (resursi ≥0, svaki vlastiti sektor ≥1 flota, bodovi = izračunati iz stanja, partija završi ≤60 rundi).
- **bots:** Normalni pobjeđuje Laganog u ≥70 % od 200 partija (seedano).
- **server:** integracijski testovi sa socket.io-client: kreiranje/ulazak, start, akcija, nedozvoljena akcija, reconnect, timer → bot, čišćenje soba.
- **web:** Vitest + Testing Library za ključne komponente; **Playwright e2e**: kreiraj sobu → dodaj 3 bota → odigraj potez → igra stigne do kraja (ubrzani timer i cilj 6 u test modu); drugi preglednik ulazi preko linka.
- **CI (GitHub Actions):** lint (ESLint), typecheck, testovi, build, e2e na svakom pushu/PR-u.

## 7. Objava ("publish ready")
- `Dockerfile` (multi-stage, jedan kontejner: server poslužuje web) + `render.yaml` (Render Blueprint). Deploy je portabilan (Fly.io/Railway/VPS rade s istim Dockerfileom).
- README (EN + HR): opis, screenshotovi, kako igrati, lokalni razvoj, deploy u 3 koraka.
- U aplikaciji: Pravila (EN/HR), Privatnost (prikupljamo samo nadimak u memoriji za trajanje sobe i token u localStorageu; bez analitike i kolačića za praćenje), Zasluge.
- `LICENSE`, `CHANGELOG.md`, verzija `1.0.0`, favicon/PWA ikone, OG slika.
- Produkcijski checklist: sigurnosna zaglavlja, rate limit, validacija svih ulaza, `/healthz`, strukturirani logovi, bez `console.log` šuma.

## 8. Odluke korisnika (2026-10-20)
1. **Repozitorij: javni** — `github.com/toma1203/starhold`.
2. **Licenca: sva prava pridržana** (`LICENSE` = proprietary, izvorni kod vidljiv, bez dozvole za korištenje/distribuciju).
3. **Hosting: Render** (besplatni plan za početak; `render.yaml` Blueprint). Korisnik otvara Render račun i povezuje repozitorij; sve ostalo je pripremljeno.

Status spec-a: **odobren**.
