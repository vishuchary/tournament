# Mountain House TT Club — Requirements & Recreation Guide

## What It Is

A Progressive Web App (PWA) for running table tennis tournaments at Mountain House TT Club. Players can view live scores in real time from any device. Admins create and manage tournaments via a PIN-protected admin mode. Hosted on Vercel, data synced via Firebase Realtime Database.

**Live URL:** https://tt-scoring.vercel.app

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 (Vite plugin) |
| Database | Firebase Realtime Database |
| Hosting | Vercel |
| PWA | vite-plugin-pwa (autoUpdate service worker) |

Key config files:
- `app/vite.config.ts` — Vite + Tailwind + PWA plugin
- `app/.npmrc` — `legacy-peer-deps=true` (vite-plugin-pwa peer conflict with Vite 8)
- `app/vercel.json` — Vercel build config (root: app/, SPA rewrites)
- `app/src/firebase.ts` — Firebase init with `firebaseConfig`

---

## Full Feature Requirements

### 1. Home Screen
- Club banner photo (`/public/banner.jpg`) as full-width header with gradient overlay
- Title: "🏓 Mountain House TT Club" overlaid on banner
- Two sections: **In Progress** (live tournaments) and **History** (completed)
- Auto-navigates to the active in-progress tournament on first load
- Completed tournaments show a 🔒 lock icon and "Done" badge
- **Admin mode**: 🔑 Admin button opens PIN modal; when active, "Admin ✓ · Exit" button shows on banner
- **+ New** button only visible in admin mode
- Rankings and Players buttons always visible

### 2. Player Profiles

Fields: Name (required), Age, Sex (Male/Female, default Male), Handedness (Right/Left, default Right), Place (default "Mountain House")

- Stored in Firebase at `/players/{id}`
- Listed alphabetically
- Editable and deletable at any time

### 3. CSV Import

Admin mode shows an **Import CSV** button (home screen, next to "+ New"). Opens a dedicated import screen.

**CSV format:**
```
Player 1,Player 2,Game 1 Score,Game 2 Score,…,Opponent 1,Opponent 2
Chandu,Pradeep,11-9,11-9,Chary,Partha
```
- Each row = one completed match
- Score format: `team1Score-team2Score` (e.g. `11-9`)
- Omit Player 2 / Opponent 2 columns for singles

**Auto-detection:**
- **Singles vs doubles**: whether Player 2 / Opponent 2 columns have data
- **Game count**: number of `Game N Score` columns → `setCount`
- **Format**: always `games` (all games played, rank by total game wins)

**Import flow:**
1. Paste CSV text or upload a `.csv` file (FileReader, client-side)
2. Click **Parse CSV** → preview: teams detected, match count, any warnings
3. Set tournament name and date (defaults to today)
4. Click **Create Tournament** → saved to Firebase, redirects to tournament view

All parsed matches are marked `completed: true`. All unique teams go in a single group (Level 1, Group A). Tournament appears on home screen immediately after creation.

### 4. Tournament Creation (3-step wizard)

**Step 1 — Meta:**
- Tournament name (default: `Tournament_N`)
- **Date of tournament** — date picker (defaults to today; displayed on tournament cards)
- **Assignment Mode**: Random or Custom (see below)
- **Match format**: Sets or Games
  - Sets: choose odd count (1, 3, 5, 7, 9); winner by sets won (first to ceil(N/2)); label e.g. "Best of 3 Sets"
  - Games: choose any count (1–6); all games played; winner by total game wins; label e.g. "2 Games"
- Match type: Singles or Doubles (applies to all teams in the tournament)

**Step 2 — Select Players:**
- Checkbox list of all registered players
- Selected players shown in an ordered list with × remove
- **Custom mode only**: ↑↓ arrows to reorder (controls team pairing for doubles, group seeding for all)
- **Singles**: each selected player = one team (name = player name)
- **Doubles**: consecutive pairs become teams (1+2, 3+4, …); team name = `P1_P2`; unpaired player shown with amber warning
- "Next" disabled until ≥2 teams formed and no odd doubles count

**Step 3 — Configure Groups:**
- Number of groups input (clamped to 1…team count); changing resets to serpentine seeding
- Live preview: each group card shows assigned teams, team count, match count
- **← → buttons** per team to move between adjacent groups (available in both modes)
- **Random mode**: 🔀 Re-shuffle button randomizes team order and group assignments
- **Custom mode**: hint text explains ← → usage
- Initial distribution via serpentine seeding (0→A, 1→B, 2→B, 3→A, …)

**Random vs Custom modes:**
| | Random | Custom |
|---|---|---|
| Team pairing | App shuffles players | ↑↓ reorder controls pairing |
| Group assignment | Random + serpentine | Serpentine from your order |
| Re-shuffle | 🔀 button available | Not available |
| Manual group adjust | ← → per team | ← → per team |

### 4. Scoring

**Match entry (bottom sheet modal):**
- TT rules: win a game with ≥11 points AND ≥2 point lead
- **Sets format**: configurable odd count; rows beyond the deciding set dim (greyed out, `opacity-30`); trailing unplayed 0-0 sets trimmed on save
- **Games format**: configurable count; all rows always active (all games played regardless of score)
- Score input selects all text on focus (prevents 0-prepend bug)
- Winner banner shown in modal when a winner can be determined
- Save marks match as completed; Clear resets scores
- `readOnly` mode: shows scores without inputs or Save/Clear buttons (for locked tournaments)

### 5. Multi-Level Tournament

**Level 1:** Round-robin within each group (all vs all).

**When Level N is complete (all matches done):**
- Green "✅ Level N complete!" banner appears
- "Setup Level N+1 →" button opens the advancement sheet

**Advancement sheet:**
- Ranked team list sorted by format:
  - Sets: match wins → set wins → point diff
  - Games: total game wins → point diff
- Each team row shows stat summary: `NW-NL` (sets format) or `NG` game wins (games format)
- Checkbox per team; minimum 2 selected
- "Quick select top N" number input auto-checks top N
- "Groups in Level N+1" input
- Teams distributed via serpentine seeding across new groups
- Level name: "Finals" if 2 teams selected, else "Level N+1"

**Finals:** When a 1-group, 2-team level completes, shows 🏆 champion banner. Admin also sees a "+ Setup Level N+1" button to add further levels after finals.

**Level tabs:** All levels accessible; completed levels show ✓.

### 6. Standings (within a group)

**Sets format columns:** `#` · Team · MP · W · L · Sets W-L · Pts +/- · Diff
Sort: match wins → point diff

**Games format columns:** `#` · Team · MP · GW · GL · Pts +/- · Diff
Sort: total game wins → point diff

Medal icons for top 3: 🥇🥈🥉

### 7. Team Names

Team display names are computed at render time from `teamDisplayName(team)`:
- Takes the **last word** of each player's full name, up to **8 characters**, joined by `_`
- Single-name players use their first (and only) word
- Falls back to `team.name` if no players are assigned
- Applied everywhere: match cards, standings, score entry, advancement sheet
- Old tournaments display correctly without any data migration

### 8. Editing After Creation

All names editable while tournament is unlocked:
- Tournament name: tap to edit inline in header
- Team name: InlineInput in Teams tab
- Player slot: tap to open PlayerPicker (registry + custom name option)
- PlayerPicker excludes names used in ANY team/group in the same level (cross-group exclusion)

### 9. Admin / Lock System

- Completed tournaments are automatically **locked** (view-only for all users)
- Lock indicator: 🔒 on tournament cards and in tournament header
- "Admin Login" link in lock banner inside TournamentView
- Admin PIN modal (`VITE_ADMIN_PIN` env var, default `1234`)
- Admin mode is session-only (resets on page refresh — by design)
- When admin: Delete button visible, names editable, scores enterable, + New button visible
- Non-admin: read-only for locked tournaments (scores still viewable)

### 10. Player Rankings

Scoring system (computed dynamically, not stored):

| Event | Points |
|---|---|
| Participate in a level | +2 |
| Win an individual game | +2 |
| Tournament winner (last level) | +2 bonus |
| Tournament runner-up (last level) | +1 bonus |

**Ranking rules:**
- Sorted by total points descending; game wins as tiebreaker
- Same score = same rank; next rank skips (1, 1, 3, 4, …)
- Point differential used as tiebreaker when game wins are tied in a match

**Storage:** Rankings are persisted in Firebase at `/rankings/{playerName}`. Recomputed and saved automatically on every tournament create, update, or delete. `RankingsScreen` subscribes to `/rankings` directly — no local computation at read time.

**Rankings screen (IPL-style):**
- Top 3 ranks shown as gradient podium cards (gold/silver/bronze)
- Tied players at same rank shown together with "Tied — Rank N" label
- Remaining players as compact rows with progress bars
- Non-admins see only players ranked ≤ `VITE_PUBLIC_RANKINGS_LIMIT` (default 5); footer shows hidden count
- Score breakdown (P = participation, G = game wins, B = bonus) visible to admins only

### 11. Real-time Sync

- All data (tournaments + players) synced live via Firebase `onValue` listeners
- Optimistic UI: local state updated immediately, Firebase confirms async
- Multiple devices see live score changes instantly

### 12. PWA

- Installable on iPhone via Safari → Add to Home Screen
- Works offline (Workbox service worker caches all assets)
- `display: standalone`, portrait orientation
- `autoUpdate` — service worker updates silently in background

---

## Data Model (`src/types.ts`)

```typescript
type MatchFormat = 'sets' | 'games';

interface Player {
  id: string; name: string;
  age?: number; sex?: 'male' | 'female';
  hand?: 'right' | 'left'; place?: string;
}

interface Team {
  id: string; name: string;
  type: 'singles' | 'doubles'; players: string[];
}

interface Game { team1Score: number; team2Score: number; }

interface Match {
  id: string; team1Id: string; team2Id: string;
  games: Game[]; completed: boolean;
}

interface Group { id: string; name: string; teams: Team[]; matches: Match[]; }

interface TournamentLevel { id: string; name: string; groups: Group[]; }

interface Tournament {
  id: string; name: string;
  format: MatchFormat;
  setCount?: number;        // sets: odd (1,3,5,7,9); games: any (1-6); default 3/2
  matchType?: 'singles' | 'doubles';
  levels: TournamentLevel[];
  createdAt: number;
  date?: string;            // YYYY-MM-DD, shown on tournament cards
}
```

**PlayerRanking** (computed, not stored):
```typescript
interface PlayerRanking {
  name: string; points: number;
  participationPts: number; gameWinPts: number; bonusPts: number;
  gameWins: number; matchesPlayed: number;
}
```

**Firebase gotcha:** Firebase drops empty arrays and serializes non-empty arrays as `{"0":x,"1":y}` objects. The `toArray<T>()` normalizer in `store.ts` handles both on read. Old tournaments that stored `groups` at the top level (before multi-level support) are auto-migrated to `levels[0].groups` on read.

---

## File Structure

```
app/
  .env                           # VITE_PUBLIC_RANKINGS_LIMIT=5
  vercel.json                    # Vercel build + SPA rewrite config
  src/
    App.tsx                      # Home screen, admin state, routing
    types.ts                     # All TypeScript interfaces
    store.ts                     # Firebase CRUD + normalisation
    rankings.ts                  # computeStandings, computePlayerRankings, generateMatches
    firebase.ts                  # Firebase app init
    components/
      TournamentSetup.tsx        # 3-step tournament creation wizard
      ImportCSV.tsx              # CSV import screen — paste/upload match scores → completed tournament
      TournamentView.tsx         # Tournament view + level tabs + AdvanceSetup sheet
      GroupView.tsx              # Matches / Standings / Teams tabs
      MatchEntry.tsx             # Score entry bottom sheet (supports readOnly)
      PlayerPicker.tsx           # Player selection modal with usedNames exclusion
      PlayersScreen.tsx          # Player profile management
      RankingsScreen.tsx         # IPL-style player rankings leaderboard
      AdminLogin.tsx             # PIN entry modal
  public/
    banner.jpg                   # Club group photo
    pwa-192.png / pwa-512.png    # PWA icons
  scripts/
    seed-test-tournament.js      # Seed 1 test tournament (18 players, 3 levels, doubles)
    seed-tournaments-2026.js     # Seed 3 completed 2026 tournaments (20 players)
    recompute-rankings.js        # Rewrite /rankings from all tournament data
sample-tournaments/
  players_20.json                # Firebase export: 20 players + 3 tournaments
  tournament_sampes.json         # Earlier sample export
```

---

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `VITE_ADMIN_PIN` | Admin login PIN | `1234` |
| `VITE_PUBLIC_RANKINGS_LIMIT` | Max players shown in rankings for non-admins | `5` |

Set in Vercel: Project → Settings → Environment Variables.
Local: edit `app/.env`.

---

## Prompts to Recreate (Step by Step)

Use these prompts with Claude Code in sequence. Each builds on the previous.

---

### Prompt 1 — Project Scaffold

```
Create a React 19 + TypeScript + Vite 8 app in a folder called `app/`.
Add Tailwind CSS 4 (use @tailwindcss/vite plugin, not postcss).
Add Firebase 11 (firebase/app, firebase/database).
Add vite-plugin-pwa for PWA support.
Add an .npmrc with legacy-peer-deps=true to handle peer dep conflicts.

Create src/firebase.ts that initializes Firebase with a placeholder firebaseConfig.
Export `db` as the Realtime Database instance.

Create src/types.ts with these interfaces:
- MatchFormat = 'sets' | 'games'
- Player { id, name, age?, sex?, hand?, place? }
- Team { id, name, type: 'singles'|'doubles', players: string[] }
- Game { team1Score, team2Score }
- Match { id, team1Id, team2Id, games: Game[], completed }
- Group { id, name, teams, matches }
- TournamentLevel { id, name, groups }
- Tournament { id, name, format, matchType?, levels: TournamentLevel[], createdAt }
- TeamStats (matchesPlayed, matchWins, matchLosses, setWins, setLosses,
             gameWins, gameLosses, pointsFor, pointsAgainst, pointDiff, rank)
- PlayerRanking { name, points, participationPts, gameWinPts, bonusPts, gameWins, matchesPlayed }

Create src/store.ts with Firebase CRUD:
- IMPORTANT: Firebase drops empty arrays and converts arrays to {0: x, 1: y} objects.
  Write toArray<T>() to normalize both cases.
  normalizeTournament(raw) handles old format (groups at top level, before multi-level)
  and new format (levels array); calls toArray on all nested arrays including team.players.
- subscribeTournaments(callback) — onValue listener, sorted by createdAt desc
- saveTournament(t), deleteTournament(id)
- subscribePlayers(callback) — onValue listener, sorted alphabetically
- savePlayer(p), deletePlayer(id)

Create src/rankings.ts:
- gameWinner(s1, s2): win requires >=11 pts AND >=2 pt lead
- computeStandings(group, format): TeamStats[] sorted by matchWins then pointDiff
- computeCrossGroupRankings(groups, format): flatMap standings, re-sort by matchWins→setWins→pointDiff
- generateMatches(teams): round-robin pairs
- computePlayerRankings(tournaments): PlayerRanking[]
  Scoring per tournament:
    +2 per level participated (any team in any group of that level)
    +2 per individual game won
    +2 winner bonus / +1 runner-up bonus from last completed level
  When game wins are tied in a match, use point differential as tiebreaker.
  Sort by points desc, then gameWins desc.
```

---

### Prompt 2 — Home Screen & App Shell

```
Create src/App.tsx with:
- State: tournaments[], players[], view (home/new/tournament/players/rankings),
  isAdmin, showAdminLogin
- useEffect: subscribeTournaments + subscribePlayers on mount
- Auto-navigate to in-progress tournament on first load (use a ref)
- getTournamentStatus(t): not-started / in-progress / completed
- TournamentCard: name, status badge (Live/Done), 🔒 for completed,
  level/group count, format, date, match progress
- Home layout:
  - Full-width banner with gradient overlay, title overlaid
  - "Admin ✓ · Exit" on banner when admin
  - Header row: 🔑 Admin (when not admin), Rankings, Players, + New (admin only)
  - In Progress section + History section
- Rankings view → RankingsScreen with isAdmin prop
- Pass isAdmin + onRequestAdmin to TournamentView
```

---

### Prompt 3 — Admin Login

```
Create src/components/AdminLogin.tsx:
- Bottom sheet modal (fixed, bottom on mobile, centered on sm+)
- Password input (type=password, inputMode=numeric)
- Compare to import.meta.env.VITE_ADMIN_PIN || '1234'
- Show "Incorrect PIN" on failure, clear input
- Props: onSuccess(), onCancel()
```

---

### Prompt 4 — Player Management

```
Create src/components/PlayersScreen.tsx:
- Header with back + "+ Add Player" button
- Player list: name + summary (Age · Sex · Handedness · Place)
- Edit/delete per player
- PlayerForm bottom sheet: Name, Age, Place, Sex toggle, Handedness toggle
- Uses savePlayer / deletePlayer from store

Create src/components/PlayerPicker.tsx:
- Bottom sheet with search/filter input (autofocus)
- Props: players, current, usedNames?: Set<string>, onSelect, onCancel
- Filter out players in usedNames (unless name === current)
- Highlight current with ✓
- "Use '...'" option for custom names not in registry
```

---

### Prompt 5 — Tournament Setup (3-step wizard)

```
Create src/components/TournamentSetup.tsx with 3 steps:

State: mode ('random'|'custom'), step, name, format, matchType, selected[],
       groupCount, teamOrder[], groupAssignments[]

Helpers:
- shuffle<T>(arr): Fisher-Yates shuffle
- serpentineGroupIndex(teamIdx, groupCount): round-robin seeding
- teamsFromOrder(order): singles → each player is a team; doubles → consecutive pairs
- initAssignments(order, gc): teamsFromOrder then serpentine per team
- getGroupDist(): uses teamOrder + groupAssignments state

Step 1 (meta):
- Tournament name input (default Tournament_N)
- Assignment mode cards: "🔀 Random" (app shuffles) / "✏️ Custom" (you control)
- Match format cards: "Best of 3 Sets" / "2 Games"
- Match type cards: "Singles" / "Doubles"

Step 2 (players):
- Mode badge shown in header (Random / Custom)
- Checkbox list of unselected players at bottom
- Selected players shown at top with × remove
- Custom mode only: ↑↓ arrows to reorder (controls pairing order)
- Doubles: show pairs in blue boxes, unpaired in amber "needs a partner"
- Random mode: show note "Teams and groups will be randomized on next step"
- "Next" disabled until ≥2 teams and no odd doubles

Transition to step 3 (enterGroupStep):
- Random: shuffle(selected) → setTeamOrder; initAssignments → setGroupAssignments
- Custom: setTeamOrder(selected); initAssignments → setGroupAssignments

Step 3 (groups):
- Header: Random mode shows 🔀 Re-shuffle button (re-shuffles teamOrder + resets assignments)
- Number of groups input; onChange → handleGroupCountChange (resets to serpentine)
- Group preview cards: group name, team count, match count
  - Each team row: name (+ players for doubles), ← → buttons when groupCount > 1
  - ← moves team to previous group (disabled if in first), → to next (disabled if in last)
- moveTeam(teamIdx, dir): updates groupAssignments[teamIdx] ± 1, clamped to [0, groupCount-1]

On create: build Group[] from getGroupDist(), wrap in TournamentLevel 'Level 1', call onCreate.
```

---

### Prompt 6 — Match Scoring

```
Create src/components/MatchEntry.tsx:
- Bottom sheet modal; Props: match, team1, team2, format, readOnly?, onSave, onCancel
- Sets format: 3 score rows; Games format: 2 score rows
- onFocus selects all text (prevents 0-prepend)
- Visual winner highlight per game (bold winning score)
- Save marks completed, Clear resets scores
- readOnly mode: title = "Match Scores", no inputs (just display), no Save/Clear,
  shows "🔒 View only" footer
```

---

### Prompt 7 — Group View

```
Create src/components/GroupView.tsx:
Props: group, allGroups?, format, players?, isLocked?, onUpdate

Three tabs: Matches | Standings | Teams

Matches tab:
- Progress bar (completed / total matches)
- Match cards: team names, game scores when done, Done/Pending badge
- Click opens MatchEntry; when isLocked passes readOnly=true (still opens)

Standings tab:
- Sets format: # | Team | MP | W | L | Sets W-L | Pts +/- | Diff (sorted by match wins)
- Games format: # | Team | MP | GW | GL | Pts +/- | Diff (sorted by total game wins)
- 🥇🥈🥉 for top 3, yellow highlight rank 1

Teams tab:
- Per team: InlineInput for team name, PlayerPicker button per player slot
- PlayerPicker usedNames = all players across ALL groups in allGroups (except current slot)
- When isLocked: team name and players shown as plain text, no editing
```

---

### Prompt 8 — Tournament View (Multi-level)

```
Create src/components/TournamentView.tsx:
Props: tournament, players, isAdmin, onUpdate, onDelete, onBack, onRequestAdmin

State: viewLevel, selectedGroupId, editingName, showAdvance

Lock logic:
- tournamentComplete = all matches in all levels done
- isLocked = tournamentComplete && !isAdmin
- When locked: 🔒 in title, lock banner with "Admin Login" link
- Tournament name editable only when !isLocked; Delete only when isAdmin

Level tabs (>1 level): "Level 1 ✓", "Finals", etc.
Group tabs: shown when current level has >1 group

GroupView rendered for selected group; pass allGroups, players, isLocked.

Level complete logic (latest level):
- isFinals = 1 group with 2 teams
- Finals complete → 🏆 champion banner (team name + players)
- Non-finals complete → green banner + "Setup Level N+1 →"

AdvanceSetup bottom sheet:
- computeCrossGroupRankings for ranked list
- Checkbox per team, min 2, "Quick select top N" shortcut
- "Groups in Level N+1" input (max floor(selectedCount/2))
- Level name = 'Finals' if 2 teams, else 'Level N+1'
- Serpentine seeding; create new TournamentLevel; call onUpdate
```

---

### Prompt 9 — Player Rankings Screen

```
Create src/components/RankingsScreen.tsx:
Props: tournaments, isAdmin?, onBack

Compute rankings via computePlayerRankings(tournaments).

Rank assignment: same points = same rank; next rank skips (1,1,3,4,…).
Use assignRanks() that finds first index with same points.

Non-admin visibility:
- Read VITE_PUBLIC_RANKINGS_LIMIT (default 5)
- Filter to players whose rank <= limit
- Show "+N more · login as admin to see all" footer

Display:
- Top 3 ranks as podium cards (gold/silver/bronze based on rank, not position)
  When multiple players share a rank, show "Tied — Rank N" label above the group
- Remaining players as compact rows with rank number
- Progress bar relative to leader's points (min 4% width)
- Score breakdown (P + G + B chips) shown only when isAdmin
- Admin footer: "P = participation · G = game wins · B = winner/runner-up bonus"
```

---

### Prompt 10 — Deployment

```
Deploy to Vercel:
- Create app/vercel.json: { buildCommand: "npm run build", outputDirectory: "dist",
  rewrites: [{ source: "/(.*)", destination: "/index.html" }] }
- cd app && vercel --prod --yes

Set environment variables in Vercel dashboard (Settings → Environment Variables):
- VITE_ADMIN_PIN = your chosen PIN
- VITE_PUBLIC_RANKINGS_LIMIT = 5 (or desired number)

Firebase setup:
1. Create project at console.firebase.google.com
2. Enable Realtime Database (start in test mode)
3. Copy firebaseConfig into src/firebase.ts
4. Set database rules:
   { "rules": { ".read": true, ".write": true } }
   (test mode rules expire after 30 days — set permanent rules)

PWA install on iPhone:
- Open app URL in Safari → Share → Add to Home Screen
- Hard refresh after updates: close app fully and reopen
```

---

## Scripts

Utility Node.js scripts in `app/scripts/` (ES modules, run with `node`):

| Script | Purpose |
|---|---|
| `seed-test-tournament.js` | Creates a 3-level doubles tournament with 18 players, random teams & results |
| `seed-tournaments-2026.js` | Creates 3 completed 2026 tournaments for all 20 players (see below) |
| `recompute-rankings.js` | Reads all tournaments from Firebase, rewrites `/rankings` — use after manual DB edits |

### 2026 Seed Tournaments

**New Year 2026 (Singles)**
- 20 players, one team per player
- L1: 4 groups × 5 players, best of 3 sets
- L2: Top 2 from each group → 2 groups × 4 players, best of 3 sets
- Finals: Top 1 from each group, best of 5 sets

**Summer 2026 Doubles**
- 10 doubles teams (20 players randomly paired)
- L1: 2 groups × 5 teams, best of 3 sets
- L2: Top 2 from each group → 2 groups × 2 teams, best of 3 sets
- Finals: Top 1 from each group, best of 5 sets

**Winter 2026 Doubles**
- 10 doubles teams (20 players randomly paired)
- L1: 1 group × 10 teams, 2 games each (no best-of)
- L2: Top 4 teams, 1 group × 4 teams, best of 5 sets
- Finals: Top 2 teams, best of 5 sets

All seed tournaments are generated with random-but-valid scores and are fully completed (all matches marked done, rankings recomputed).

### Sample Data

`sample-tournaments/players_20.json` — Firebase export with 20 player profiles and 3 tournaments (Spring Tournament, Summer 2026, Test Tournament). Use as reference for the data shape or to restore a known state.

`sample-tournaments/tournament_spring_2006.json` — Spring 2006 tournament export (games format, setCount=2). Used to identify and verify the games-format ranking bug fix.

---

## Club Players (20 registered)

Kiran, Shiva Monigari, Sharma, Chandu, Sagar, Kumar, Chary, Raja, Rama, Prajwal, Prasad, Harsha, Pradeep, Sateesh V, Manju, Teju, Giri, Shiva Meda, Hemanth, Ravi

All players stored in Firebase at `/players/{id}` with fields: name, age, sex, hand, place.

---

## Known Gotchas

1. **Firebase array serialization**: Firebase serializes `[a,b]` as `{"0":a,"1":b}` and drops `[]` entirely. Always use `toArray<T>()` when reading from Firebase. This applies to `team.players` too — easy to miss on nested objects.

2. **Peer dep conflict**: `vite-plugin-pwa` 1.x doesn't declare Vite 8 compatibility. Requires `legacy-peer-deps=true` in `app/.npmrc`.

3. **PWA cache on iPhone**: After deploying, users need to close and fully reopen the app to get the new service worker. `autoUpdate` handles this silently but requires a restart.

4. **Firebase test mode expiry**: Expires after 30 days. Set permanent rules in the Firebase console.

5. **Admin mode is session-only**: Refreshing the page logs out of admin mode (React state, not localStorage — by design).

6. **Point differential tiebreaker**: When two teams are tied on game wins in a match, total point differential determines the winner. This applies in both `computeStandings` and `computePlayerRankings` — both must be consistent.
