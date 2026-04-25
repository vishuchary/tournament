// Run: node app/scripts/seed-test-tournament.js
// Creates a complete 3-level doubles tournament with all 18 club players, best of 3 sets.

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCCM3KJgBVXNLt3cS17nnshMN2X2DENDQI",
  authDomain: "tt-scoring-60039.firebaseapp.com",
  databaseURL: "https://tt-scoring-60039-default-rtdb.firebaseio.com",
  projectId: "tt-scoring-60039",
  storageBucket: "tt-scoring-60039.firebasestorage.app",
  messagingSenderId: "1004560876496",
  appId: "1:1004560876496:web:43df450d12522ac7b7efd5"
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function shortName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const base = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return base.slice(0, 6);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Always produces a valid TT game (winner=11, loser=0–8, lead ≥3)
function randomGame() {
  const t1Wins = Math.random() > 0.5;
  const loserScore = Math.floor(Math.random() * 9); // 0–8
  return t1Wins
    ? { team1Score: 11, team2Score: loserScore }
    : { team1Score: loserScore, team2Score: 11 };
}

function gameWinner(s1, s2) {
  if (s1 >= 11 && s1 - s2 >= 2) return 'team1';
  if (s2 >= 11 && s2 - s1 >= 2) return 'team2';
  return null;
}

// Best of 3 sets match — plays until one team wins 2 sets
function randomMatch(team1Id, team2Id) {
  const games = [];
  let t1Sets = 0, t2Sets = 0;
  while (t1Sets < 2 && t2Sets < 2) {
    const g = randomGame();
    const w = gameWinner(g.team1Score, g.team2Score);
    if (w === 'team1') t1Sets++;
    else t2Sets++;
    games.push(g);
  }
  return { id: uid(), team1Id, team2Id, games, completed: true };
}

// All-vs-all round robin
function roundRobin(teams) {
  const matches = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++)
      matches.push(randomMatch(teams[i].id, teams[j].id));
  return matches;
}

// Sort teams by match wins, then point differential (same logic as computeStandings)
function rankTeams(teams, matches) {
  const wins = Object.fromEntries(teams.map(t => [t.id, 0]));
  const diff = Object.fromEntries(teams.map(t => [t.id, 0]));
  for (const m of matches) {
    let t1w = 0, t2w = 0, pd = 0;
    for (const g of m.games) {
      const w = gameWinner(g.team1Score, g.team2Score);
      if (w === 'team1') t1w++;
      else if (w === 'team2') t2w++;
      pd += g.team1Score - g.team2Score;
    }
    const t1wins = t1w > t2w || (t1w === t2w && pd > 0);
    wins[t1wins ? m.team1Id : m.team2Id]++;
    diff[m.team1Id] += pd;
    diff[m.team2Id] -= pd;
  }
  return [...teams].sort((a, b) =>
    wins[b.id] !== wins[a.id] ? wins[b.id] - wins[a.id] : diff[b.id] - diff[a.id]
  );
}

// Serpentine seeding: team index → group index
function serpentine(idx, groupCount) {
  const round = Math.floor(idx / groupCount);
  const pos = idx % groupCount;
  return round % 2 === 0 ? pos : groupCount - 1 - pos;
}

function distributeToGroups(teams, groupCount) {
  const buckets = Array.from({ length: groupCount }, () => []);
  teams.forEach((t, i) => buckets[serpentine(i, groupCount)].push(t));
  return buckets;
}

function makeGroups(buckets) {
  return buckets.map((teams, gi) => ({
    id: uid(),
    name: gi === 0 ? 'Group A' : 'Group B',
    teams,
    matches: roundRobin(teams),
  }));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  // Randomly pair all 18 players into 9 doubles teams
  const playerNames = shuffle([
    'Kiran', 'Shiva Monigari', 'Sharma', 'Chandu', 'Chary', 'Raja',
    'Rama', 'Prajwal', 'Prasad', 'Harsha', 'Pradeep', 'Sateesh V',
    'Manju', 'Teju', 'Giri', 'Shiva Meda', 'Hemanth', 'Ravi',
  ]);

  const allTeams = [];
  for (let i = 0; i + 1 < playerNames.length; i += 2) {
    const p1 = playerNames[i], p2 = playerNames[i + 1];
    allTeams.push({ id: uid(), name: `${shortName(p1)}_${shortName(p2)}`, type: 'doubles', players: [p1, p2] });
  }

  // ── Level 1: 2 groups (5 + 4 teams) ─────────────────────────────────────
  const level1Groups = makeGroups(distributeToGroups(allTeams, 2));
  const level1 = { id: uid(), name: 'Level 1', groups: level1Groups };

  // Top 2 from each group advance → 4 teams
  const l2Teams = level1Groups.flatMap(g => rankTeams(g.teams, g.matches).slice(0, 2));

  // ── Level 2: 2 groups of 2 teams ─────────────────────────────────────────
  const level2Groups = makeGroups(distributeToGroups(l2Teams, 2));
  const level2 = { id: uid(), name: 'Level 2', groups: level2Groups };

  // Top 1 from each group advances → 2 finalists
  const finalists = level2Groups.map(g => rankTeams(g.teams, g.matches)[0]);

  // ── Level 3 / Finals: 1 match ─────────────────────────────────────────────
  const finals = {
    id: uid(),
    name: 'Finals',
    groups: [{
      id: uid(),
      name: 'Finals',
      teams: finalists,
      matches: [randomMatch(finalists[0].id, finalists[1].id)],
    }],
  };

  const tournament = {
    id: uid(),
    name: 'Test Tournament',
    format: 'sets',
    matchType: 'doubles',
    createdAt: Date.now(),
    levels: [level1, level2, finals],
  };

  // ── Print summary ────────────────────────────────────────────────────────
  console.log('\n📋 Tournament: Test Tournament (3 levels, best of 3 sets, doubles)\n');
  console.log('Level 1 — 2 Groups:');
  level1Groups.forEach(g => {
    console.log(`  ${g.name} (${g.teams.length} teams, ${g.matches.length} matches):`);
    g.teams.forEach(t => console.log(`    • ${t.name} (${t.players.join(' + ')})`));
  });
  console.log('\nLevel 2 — Advancers (top 2 from each L1 group):');
  level2Groups.forEach(g => {
    console.log(`  ${g.name}: ${g.teams.map(t => t.name).join(' vs ')}`);
  });
  const finalWinnerTeam = rankTeams(finals.groups[0].teams, finals.groups[0].matches)[0];
  console.log(`\nFinalists: ${finalists.map(t => t.name).join(' vs ')}`);
  console.log(`🏆 Champion: ${finalWinnerTeam.name} (${finalWinnerTeam.players.join(' + ')})`);
  console.log(`\nSaving tournament ${tournament.id} to Firebase...`);

  await set(ref(db, `tournaments/${tournament.id}`), tournament);
  console.log('✓ Done! Open the app to view.');
  console.log('  Rankings will recompute next time any tournament is saved via the app.\n');

  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
