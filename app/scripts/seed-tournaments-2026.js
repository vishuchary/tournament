// Run: node app/scripts/seed-tournaments-2026.js
// Creates 3 completed 2026 tournaments for all 20 club players and recomputes rankings.

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCCM3KJgBVXNLt3cS17nnshMN2X2DENDQI",
  authDomain: "tt-scoring-60039.firebaseapp.com",
  databaseURL: "https://tt-scoring-60039-default-rtdb.firebaseio.com",
  projectId: "tt-scoring-60039",
  storageBucket: "tt-scoring-60039.firebasestorage.app",
  messagingSenderId: "1004560876496",
  appId: "1:1004560876496:web:43df450d12522ac7b7efd5"
};

const PLAYERS = [
  'Kiran', 'Shiva Monigari', 'Sharma', 'Chandu', 'Sagar', 'Kumar',
  'Chary', 'Raja', 'Rama', 'Prajwal', 'Prasad', 'Harsha',
  'Pradeep', 'Sateesh V', 'Manju', 'Teju', 'Giri', 'Shiva Meda', 'Hemanth', 'Ravi',
];

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

function randomGame() {
  const t1 = Math.random() > 0.5;
  const loser = Math.floor(Math.random() * 9);
  return t1 ? { team1Score: 11, team2Score: loser } : { team1Score: loser, team2Score: 11 };
}

function gameWinner(s1, s2) {
  if (s1 >= 11 && s1 - s2 >= 2) return 'team1';
  if (s2 >= 11 && s2 - s1 >= 2) return 'team2';
  return null;
}

// Best of N (e.g. bestOf(3) = first to 2 wins, bestOf(5) = first to 3 wins)
function bestOf(t1Id, t2Id, n) {
  const need = Math.ceil(n / 2);
  const games = [];
  let a = 0, b = 0;
  while (a < need && b < need) {
    const g = randomGame();
    const w = gameWinner(g.team1Score, g.team2Score);
    if (w === 'team1') a++; else b++;
    games.push(g);
  }
  return { id: uid(), team1Id: t1Id, team2Id: t2Id, games, completed: true };
}

// Exactly 2 games (no winner-takes-all)
function twoGames(t1Id, t2Id) {
  return { id: uid(), team1Id: t1Id, team2Id: t2Id, games: [randomGame(), randomGame()], completed: true };
}

// All-vs-all round robin
function roundRobin(teams, matchFn) {
  const m = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++)
      m.push(matchFn(teams[i].id, teams[j].id));
  return m;
}

// Rank teams by match wins, then point differential
function rankTeams(teams, matches) {
  const wins = Object.fromEntries(teams.map(t => [t.id, 0]));
  const diff = Object.fromEntries(teams.map(t => [t.id, 0]));
  for (const m of matches) {
    let t1w = 0, t2w = 0, pd = 0;
    for (const g of m.games) {
      const w = gameWinner(g.team1Score, g.team2Score);
      if (w === 'team1') t1w++; else if (w === 'team2') t2w++;
      pd += g.team1Score - g.team2Score;
    }
    const winner = (t1w > t2w || (t1w === t2w && pd > 0)) ? m.team1Id : m.team2Id;
    wins[winner]++;
    diff[m.team1Id] += pd;
    diff[m.team2Id] -= pd;
  }
  return [...teams].sort((a, b) =>
    wins[b.id] !== wins[a.id] ? wins[b.id] - wins[a.id] : diff[b.id] - diff[a.id]
  );
}

// Serpentine seeding: spreads seeds evenly across groups
function serpentine(i, k) {
  const round = Math.floor(i / k);
  return round % 2 === 0 ? i % k : k - 1 - (i % k);
}

function distribute(teams, k) {
  const buckets = Array.from({ length: k }, () => []);
  teams.forEach((t, i) => buckets[serpentine(i, k)].push(t));
  return buckets;
}

const GROUP_NAMES = ['Group A', 'Group B', 'Group C', 'Group D'];

function makeGroups(buckets, matchFn) {
  return buckets.map((teams, i) => ({
    id: uid(), name: GROUP_NAMES[i] ?? `Group ${i + 1}`,
    teams, matches: roundRobin(teams, matchFn),
  }));
}

// ── Rankings recomputation ────────────────────────────────────────────────────

function toArr(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
}

async function recomputeRankings(db) {
  const snap = await get(ref(db, 'tournaments'));
  const raw = snap.val();
  if (!raw) return;

  const tournaments = Object.values(raw).map(t => ({
    ...t,
    levels: toArr(t.levels).map(l => ({
      ...l,
      groups: toArr(l.groups).map(g => ({
        ...g,
        teams: toArr(g.teams).map(tm => ({ ...tm, players: toArr(tm.players) })),
        matches: toArr(g.matches).map(m => ({ ...m, games: toArr(m.games) })),
      })),
    })),
  }));

  const map = new Map();
  function gp(name) {
    if (!map.has(name)) map.set(name, { name, points: 0, participationPts: 0, gameWinPts: 0, bonusPts: 0, gameWins: 0, matchesPlayed: 0 });
    return map.get(name);
  }

  for (const t of tournaments) {
    // +2 per level participated
    for (const level of t.levels) {
      const lp = new Set();
      for (const g of level.groups) for (const tm of g.teams) for (const n of tm.players) if (n) lp.add(n);
      for (const n of lp) { const s = gp(n); s.participationPts += 2; s.points += 2; }
    }
    // +2 per game won
    for (const level of t.levels) {
      for (const group of level.groups) {
        const teamMap = new Map(group.teams.map(tm => [tm.id, tm]));
        for (const match of group.matches) {
          if (!match.completed || !match.games.length) continue;
          const t1 = teamMap.get(match.team1Id), t2 = teamMap.get(match.team2Id);
          const inMatch = new Set();
          for (const n of [...(t1?.players ?? []), ...(t2?.players ?? [])]) {
            if (n && !inMatch.has(n)) { inMatch.add(n); gp(n).matchesPlayed++; }
          }
          for (const game of match.games) {
            const w = gameWinner(game.team1Score, game.team2Score);
            if (!w) continue;
            const winTeam = teamMap.get(w === 'team1' ? match.team1Id : match.team2Id);
            for (const n of (winTeam?.players ?? [])) {
              if (!n) continue;
              const s = gp(n); s.gameWins++; s.gameWinPts += 2; s.points += 2;
            }
          }
        }
      }
    }
    // +2 winner, +1 runner-up from last level
    const last = t.levels[t.levels.length - 1];
    if (!last) continue;
    const lastMatches = last.groups.flatMap(g => g.matches);
    if (!lastMatches.length || !lastMatches.every(m => m.completed)) continue;

    let winnerId = null, runnerUpId = null;
    const isFinal = last.groups.length === 1 && last.groups[0].teams.length === 2;
    if (isFinal) {
      const fm = last.groups[0].matches[0];
      if (fm?.completed) {
        let t1w = 0, t2w = 0, pd = 0;
        for (const g of fm.games) {
          const w = gameWinner(g.team1Score, g.team2Score);
          if (w === 'team1') t1w++; else if (w === 'team2') t2w++;
          pd += g.team1Score - g.team2Score;
        }
        if (t1w !== t2w || pd !== 0) {
          const t1wins = t1w !== t2w ? t1w > t2w : pd > 0;
          winnerId = t1wins ? fm.team1Id : fm.team2Id;
          runnerUpId = t1wins ? fm.team2Id : fm.team1Id;
        }
      }
    } else {
      const ws = {}, df = {};
      for (const grp of last.groups) {
        for (const tm of grp.teams) { ws[tm.id] = 0; df[tm.id] = 0; }
        for (const m of grp.matches) {
          let t1w = 0, t2w = 0, pd = 0;
          for (const g of m.games) {
            const w = gameWinner(g.team1Score, g.team2Score);
            if (w === 'team1') t1w++; else if (w === 'team2') t2w++;
            pd += g.team1Score - g.team2Score;
          }
          const t1wins = t1w > t2w || (t1w === t2w && pd > 0);
          ws[t1wins ? m.team1Id : m.team2Id] = (ws[t1wins ? m.team1Id : m.team2Id] ?? 0) + 1;
          df[m.team1Id] = (df[m.team1Id] ?? 0) + pd;
          df[m.team2Id] = (df[m.team2Id] ?? 0) - pd;
        }
      }
      const all = last.groups.flatMap(g => g.teams).sort((a, b) =>
        (ws[b.id] ?? 0) !== (ws[a.id] ?? 0) ? (ws[b.id] ?? 0) - (ws[a.id] ?? 0) : (df[b.id] ?? 0) - (df[a.id] ?? 0)
      );
      winnerId = all[0]?.id ?? null;
      runnerUpId = all[1]?.id ?? null;
    }

    const allTeams = last.groups.flatMap(g => g.teams);
    const wt = allTeams.find(tm => tm.id === winnerId);
    const rt = allTeams.find(tm => tm.id === runnerUpId);
    for (const n of (wt?.players ?? [])) { if (n) { const s = gp(n); s.bonusPts += 2; s.points += 2; } }
    for (const n of (rt?.players ?? [])) { if (n) { const s = gp(n); s.bonusPts += 1; s.points += 1; } }
  }

  const rankings = Array.from(map.values()).sort((a, b) => b.points !== a.points ? b.points - a.points : b.gameWins - a.gameWins);
  const obj = Object.fromEntries(rankings.map(r => [r.name.replace(/[.#$[\]/]/g, '_'), r]));
  await set(ref(db, 'rankings'), obj);
  console.log(`\n✓ Rankings updated for ${rankings.length} player(s):`);
  rankings.forEach((r, i) => console.log(`  ${i + 1}. ${r.name} — ${r.points} pts (P:${r.participationPts} G:${r.gameWinPts} B:${r.bonusPts})`));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  // ── Tournament 1: New Year 2026 Singles ──────────────────────────────────
  // L1: 4 groups × 5 players, best of 3
  // L2: Top 2 from each group → 2 groups × 4 players, best of 3
  // Finals: Top 1 from each group → 2 players, best of 5
  {
    console.log('\n📋 Creating New Year 2026 (Singles)...');
    const players = shuffle(PLAYERS); // 20 players
    const allTeams = players.map(name => ({ id: uid(), name, players: [name], type: 'singles' }));

    const l1Groups = makeGroups(distribute(allTeams, 4), (a, b) => bestOf(a, b, 3));
    const level1 = { id: uid(), name: 'Level 1', groups: l1Groups };

    const l2Teams = l1Groups.flatMap(g => rankTeams(g.teams, g.matches).slice(0, 2));
    const l2Groups = makeGroups(distribute(l2Teams, 2), (a, b) => bestOf(a, b, 3));
    const level2 = { id: uid(), name: 'Level 2', groups: l2Groups };

    const finalists = l2Groups.map(g => rankTeams(g.teams, g.matches)[0]);
    const finalsGroup = {
      id: uid(), name: 'Finals', teams: finalists,
      matches: [bestOf(finalists[0].id, finalists[1].id, 5)],
    };
    const finals = { id: uid(), name: 'Finals', groups: [finalsGroup] };

    const t = {
      id: uid(), name: 'New Year 2026', format: 'sets', matchType: 'singles',
      createdAt: new Date('2026-01-05').getTime(), levels: [level1, level2, finals],
    };
    await set(ref(db, `tournaments/${t.id}`), t);

    const champion = rankTeams(finalists, finalsGroup.matches)[0];
    console.log(`  L1: 4 groups × 5 players (best of 3)`);
    l1Groups.forEach(g => console.log(`    ${g.name}: ${g.teams.map(tm => tm.name).join(', ')}`));
    console.log(`  L2: 2 groups × 4 players (best of 3, top 2 advancers)`);
    console.log(`  Finals: ${finalists.map(f => f.name).join(' vs ')} (best of 5)`);
    console.log(`  🏆 Champion: ${champion.name}`);
    console.log(`  Runner-up: ${finalists.find(f => f.id !== champion.id)?.name}`);
  }

  // ── Tournament 2: Summer 2026 Doubles ────────────────────────────────────
  // L1: 2 groups × 5 teams, best of 3
  // L2: Top 2 from each group → 2 groups × 2 teams, best of 3
  // Finals: Top 1 from each group → 2 teams, best of 5
  {
    console.log('\n📋 Creating Summer 2026 Doubles...');
    const players = shuffle(PLAYERS);
    const allTeams = [];
    for (let i = 0; i + 1 < players.length; i += 2)
      allTeams.push({ id: uid(), name: `${shortName(players[i])}_${shortName(players[i + 1])}`, players: [players[i], players[i + 1]], type: 'doubles' });

    const l1Groups = makeGroups(distribute(allTeams, 2), (a, b) => bestOf(a, b, 3));
    const level1 = { id: uid(), name: 'Level 1', groups: l1Groups };

    const l2Teams = l1Groups.flatMap(g => rankTeams(g.teams, g.matches).slice(0, 2));
    const l2Groups = makeGroups(distribute(l2Teams, 2), (a, b) => bestOf(a, b, 3));
    const level2 = { id: uid(), name: 'Level 2', groups: l2Groups };

    const finalists = l2Groups.map(g => rankTeams(g.teams, g.matches)[0]);
    const finalsGroup = {
      id: uid(), name: 'Finals', teams: finalists,
      matches: [bestOf(finalists[0].id, finalists[1].id, 5)],
    };
    const finals = { id: uid(), name: 'Finals', groups: [finalsGroup] };

    const t = {
      id: uid(), name: 'Summer 2026 Doubles', format: 'sets', matchType: 'doubles',
      createdAt: new Date('2026-04-15').getTime(), levels: [level1, level2, finals],
    };
    await set(ref(db, `tournaments/${t.id}`), t);

    const champion = rankTeams(finalists, finalsGroup.matches)[0];
    console.log(`  L1: 2 groups × 5 teams (best of 3)`);
    l1Groups.forEach(g => console.log(`    ${g.name}: ${g.teams.map(tm => tm.name).join(', ')}`));
    console.log(`  L2: 2 groups × 2 teams (best of 3, top 2 advancers)`);
    console.log(`  Finals: ${finalists.map(f => f.name).join(' vs ')} (best of 5)`);
    console.log(`  🏆 Champion: ${champion.name} (${champion.players.join(' + ')})`);
    console.log(`  Runner-up: ${finalists.find(f => f.id !== champion.id)?.name}`);
  }

  // ── Tournament 3: Winter 2026 Doubles ────────────────────────────────────
  // L1: 1 group × 10 teams, 2 games each
  // L2: Top 4 teams, 1 group × 4 teams, best of 5
  // Finals: Top 2 teams, best of 5
  {
    console.log('\n📋 Creating Winter 2026 Doubles...');
    const players = shuffle(PLAYERS);
    const allTeams = [];
    for (let i = 0; i + 1 < players.length; i += 2)
      allTeams.push({ id: uid(), name: `${shortName(players[i])}_${shortName(players[i + 1])}`, players: [players[i], players[i + 1]], type: 'doubles' });

    const l1Group = { id: uid(), name: 'Group A', teams: allTeams, matches: roundRobin(allTeams, twoGames) };
    const level1 = { id: uid(), name: 'Level 1', groups: [l1Group] };

    const top4 = rankTeams(allTeams, l1Group.matches).slice(0, 4);
    const l2Group = { id: uid(), name: 'Group A', teams: top4, matches: roundRobin(top4, (a, b) => bestOf(a, b, 5)) };
    const level2 = { id: uid(), name: 'Level 2', groups: [l2Group] };

    const top2 = rankTeams(top4, l2Group.matches).slice(0, 2);
    const finalsGroup = {
      id: uid(), name: 'Finals', teams: top2,
      matches: [bestOf(top2[0].id, top2[1].id, 5)],
    };
    const finals = { id: uid(), name: 'Finals', groups: [finalsGroup] };

    const t = {
      id: uid(), name: 'Winter 2026 Doubles', format: 'sets', matchType: 'doubles',
      createdAt: new Date('2026-04-20').getTime(), levels: [level1, level2, finals],
    };
    await set(ref(db, `tournaments/${t.id}`), t);

    const champion = rankTeams(top2, finalsGroup.matches)[0];
    console.log(`  L1: 1 group × 10 teams (2 games)`);
    console.log(`    Teams: ${allTeams.map(tm => tm.name).join(', ')}`);
    console.log(`  L2: 1 group × 4 teams (best of 5, top 4 advancers): ${top4.map(t => t.name).join(', ')}`);
    console.log(`  Finals: ${top2.map(f => f.name).join(' vs ')} (best of 5)`);
    console.log(`  🏆 Champion: ${champion.name} (${champion.players.join(' + ')})`);
    console.log(`  Runner-up: ${top2.find(f => f.id !== champion.id)?.name}`);
  }

  // Recompute rankings from all tournaments (including previously existing ones)
  console.log('\n⏳ Recomputing rankings from all tournaments...');
  await recomputeRankings(db);

  process.exit(0);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
