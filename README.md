# Mountain House TT Club — Scoring App

A real-time table tennis tournament scoring PWA for Mountain House TT Club. Players view live scores from any device. Admins create and manage tournaments via a PIN-protected admin mode.

**Live app:** https://tt-scoring.vercel.app

---

## Architecture

```
Browser / iPhone PWA
        │
        ▼
React 19 + Vite 8 (app/)
        │
        ▼
Firebase Realtime Database
        │
        ▼
All connected clients update instantly
```

### Source files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Root — view routing, Firebase subscriptions, admin state |
| `src/types.ts` | TypeScript data model: Tournament, TournamentLevel, Group, Team, Match, Game, Player |
| `src/firebase.ts` | Firebase app init — exports `db` |
| `src/store.ts` | Firebase CRUD + `toArray()` normaliser for Firebase array serialisation |
| `src/rankings.ts` | Pure logic — `generateMatches`, `computeStandings`, `computePlayerRankings` |
| `src/components/TournamentSetup.tsx` | 3-step creation wizard: meta (+ mode) → select players → configure groups (random or custom) |
| `src/components/ImportCSV.tsx` | CSV import screen — paste or upload match scores to create a completed tournament |
| `src/components/TournamentView.tsx` | Tournament detail — level tabs, lock/admin, advancement sheet |
| `src/components/GroupView.tsx` | Matches / Standings / Teams tabs within a group |
| `src/components/MatchEntry.tsx` | Score entry bottom sheet (readOnly prop for locked view) |
| `src/components/PlayerPicker.tsx` | Player selection modal with used-name exclusion |
| `src/components/PlayersScreen.tsx` | Player profile management (add/edit/delete) |
| `src/components/RankingsScreen.tsx` | IPL-style player leaderboard |
| `src/components/AdminLogin.tsx` | PIN entry modal |
| `scripts/seed-test-tournament.js` | Seeds a 3-level doubles test tournament (18 players, random results) |
| `scripts/seed-tournaments-2026.js` | Seeds 3 completed 2026 tournaments (20 players: singles + doubles) |
| `scripts/recompute-rankings.js` | Reads all tournaments from Firebase and rewrites `/rankings` |
| `sample-tournaments/players_20.json` | Firebase export snapshot: 20 player profiles + 3 seed tournaments |
| `sample-tournaments/tournament_sampes.json` | Earlier sample tournament export |
| `sample-tournaments/tournament_spring_2006.json` | Spring 2006 tournament export (games format, used to verify games-format ranking fix) |

### Data model

```
Tournament
  id, name, format ('sets'|'games'), setCount, matchType ('singles'|'doubles'),
  createdAt, date? (YYYY-MM-DD)
  └── levels[]                          ← TournamentLevel
        id, name ('Level 1', 'Finals', …)
        └── groups[]
              id, name ('Group A', …)
              ├── teams[]    id, name, type, players: string[]
              └── matches[]  id, team1Id, team2Id, completed, games[]
                                                               team1Score, team2Score
```

**Team display names** are computed at render time via `teamDisplayName(team)`: takes the last word of each player's full name, up to 8 characters, joined by `_`. Falls back to `team.name` if no players assigned. Stored team names are never shown directly.

Standings are computed on the fly. **Player rankings are stored in Firebase** at `/rankings` and recomputed whenever any tournament is created, updated, or deleted.

### Scoring rules

- A game is won when a team reaches **≥ 11 points** with a **≥ 2 point lead**
- At deuce (10-10) play continues until one team leads by 2
- **Sets format** — configurable odd count (1, 3, 5, 7, 9); match winner by sets won (first to ceil(N/2)); standings sorted by match wins → point diff; unplayed sets after the deciding set are trimmed on save
- **Games format** — configurable count (1–6); all games always played; match winner by total game wins; standings sorted by total game wins (GW) → point diff; advancement ranking also uses game wins

### Player ranking storage

Rankings are stored in Firebase at `/rankings/{playerName}` as `PlayerRanking` objects. They are recomputed from all tournament data and saved whenever a tournament is created, updated, or deleted. `RankingsScreen` reads directly from `/rankings` via a live Firebase subscription.

### Player ranking scoring

| Event | Points |
|-------|--------|
| Participate in a level | +2 |
| Win an individual game | +2 |
| Tournament winner | +2 bonus |
| Tournament runner-up | +1 bonus |

Tied players get the same rank; next rank skips (1, 1, 3, …). Non-admins see top N players only (configurable via `VITE_PUBLIC_RANKINGS_LIMIT`, default 5). Score breakdown (P/G/B) visible to admins only.

### Club players (20 registered)

Kiran, Shiva Monigari, Sharma, Chandu, Sagar, Kumar, Chary, Raja, Rama, Prajwal, Prasad, Harsha, Pradeep, Sateesh V, Manju, Teju, Giri, Shiva Meda, Hemanth, Ravi

### Seed data / scripts

```bash
# Seed 3 completed 2026 tournaments (New Year Singles, Summer Doubles, Winter Doubles)
node app/scripts/seed-tournaments-2026.js

# Seed a single 3-level test doubles tournament (18 players)
node app/scripts/seed-test-tournament.js

# Recompute /rankings from all existing tournaments (use after manual DB edits)
node app/scripts/recompute-rankings.js
```

All scripts are ES modules (`type: "module"` in package.json) and run directly with Node.js.

### Real-time sync

```
User saves score → optimistic local state update (instant)
                 → saveTournament() → Firebase set()
                 → Firebase onValue() fires on all clients
                 → React re-renders with confirmed data
```

Firebase arrays are normalised on read because Firebase drops empty arrays and returns non-empty arrays as `{"0":a,"1":b}` objects (`store.ts: toArray()`).

---

## Development

```bash
cd app
npm install
npm run dev            # localhost:5173
npm run dev -- --host  # + network URL for iPhone testing (same Wi-Fi)
npm run build          # production build
```

**iPhone testing (local):** open the Network URL in Safari → Share → Add to Home Screen.

---

## Deployment

Hosted on Vercel. Manual deploy:

```bash
cd app
vercel --prod --yes
```

**Firebase project:** `tt-scoring-60039`
Database URL: `https://tt-scoring-60039-default-rtdb.firebaseio.com`

Firebase rules (set in Firebase console → Realtime Database → Rules):
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

---

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_ADMIN_PIN` | Admin login PIN | `1234` |
| `VITE_PUBLIC_RANKINGS_LIMIT` | Max players shown in rankings for non-admins | `5` |

Set in Vercel: Project → Settings → Environment Variables.  
Local: edit `app/.env`.

---

## Key dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19 | UI |
| firebase | ^12 | Realtime Database |
| tailwindcss | ^4 | Styling |
| vite-plugin-pwa | ^1.2 | Service worker, offline, installable |
| vite | ^8 | Build tool |
| typescript | ~6 | Type safety |
