// Run: node app/scripts/recompute-rankings.js
// Reads all tournaments from Firebase, computes player rankings, and saves to /rankings.

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCCM3KJgBVXNLt3cS17nnshMN2X2DENDQI",
  authDomain: "tt-scoring-60039.firebaseapp.com",
  databaseURL: "https://tt-scoring-60039-default-rtdb.firebaseio.com",
  projectId: "tt-scoring-60039",
  storageBucket: "tt-scoring-60039.firebasestorage.app",
  messagingSenderId: "1004560876496",
  appId: "1:1004560876496:web:43df450d12522ac7b7efd5"
};

function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
}

function normalizeGroup(g) {
  return {
    ...g,
    teams: toArray(g.teams).map(t => ({ ...t, players: toArray(t.players) })),
    matches: toArray(g.matches).map(m => ({ ...m, games: toArray(m.games) })),
  };
}

function normalizeTournament(raw) {
  if (raw.groups && !raw.levels) {
    return { ...raw, levels: [{ id: raw.id + '_l1', name: 'Level 1', groups: toArray(raw.groups).map(normalizeGroup) }] };
  }
  return { ...raw, levels: toArray(raw.levels).map(l => ({ ...l, groups: toArray(l.groups).map(normalizeGroup) })) };
}

function gameWinner(s1, s2) {
  if (s1 >= 11 && s1 - s2 >= 2) return 'team1';
  if (s2 >= 11 && s2 - s1 >= 2) return 'team2';
  return null;
}

function computePlayerRankings(tournaments) {
  const map = new Map();

  function get(name) {
    if (!map.has(name)) map.set(name, { name, points: 0, participationPts: 0, gameWinPts: 0, bonusPts: 0, gameWins: 0, matchesPlayed: 0 });
    return map.get(name);
  }

  for (const t of tournaments) {
    // +2 per level participated
    for (const level of t.levels) {
      const levelPlayers = new Set();
      for (const group of level.groups)
        for (const team of group.teams)
          for (const name of team.players)
            if (name) levelPlayers.add(name);
      for (const name of levelPlayers) {
        const s = get(name);
        s.participationPts += 2;
        s.points += 2;
      }
    }

    // +2 per game won
    for (const level of t.levels) {
      for (const group of level.groups) {
        const teamMap = new Map(group.teams.map(tm => [tm.id, tm]));
        for (const match of group.matches) {
          if (!match.completed || match.games.length === 0) continue;
          const team1 = teamMap.get(match.team1Id);
          const team2 = teamMap.get(match.team2Id);
          const inMatch = new Set();
          for (const name of [...(team1?.players ?? []), ...(team2?.players ?? [])]) {
            if (name && !inMatch.has(name)) { inMatch.add(name); get(name).matchesPlayed++; }
          }
          for (const game of match.games) {
            const w = gameWinner(game.team1Score, game.team2Score);
            if (!w) continue;
            const winTeam = teamMap.get(w === 'team1' ? match.team1Id : match.team2Id);
            for (const name of (winTeam?.players ?? [])) {
              if (!name) continue;
              const s = get(name);
              s.gameWins++;
              s.gameWinPts += 2;
              s.points += 2;
            }
          }
        }
      }
    }

    // Winner +2, runner-up +1 from last level
    const lastLevel = t.levels[t.levels.length - 1];
    if (!lastLevel) continue;
    const lastMatches = lastLevel.groups.flatMap(g => g.matches);
    if (!lastMatches.length || !lastMatches.every(m => m.completed)) continue;

    let winnerTeamId = null, runnerUpTeamId = null;
    const isFinals = lastLevel.groups.length === 1 && lastLevel.groups[0].teams.length === 2;
    if (isFinals) {
      const fm = lastLevel.groups[0].matches[0];
      if (fm?.completed) {
        let t1w = 0, t2w = 0, pd = 0;
        for (const g of fm.games) {
          const w = gameWinner(g.team1Score, g.team2Score);
          if (w === 'team1') t1w++; else if (w === 'team2') t2w++;
          pd += g.team1Score - g.team2Score;
        }
        const team1Wins = t1w !== t2w ? t1w > t2w : pd > 0;
        if (t1w !== t2w || pd !== 0) {
          winnerTeamId = team1Wins ? fm.team1Id : fm.team2Id;
          runnerUpTeamId = team1Wins ? fm.team2Id : fm.team1Id;
        }
      }
    } else {
      const wins = {}, diff = {};
      for (const grp of lastLevel.groups) {
        for (const tm of grp.teams) { wins[tm.id] = 0; diff[tm.id] = 0; }
        for (const m of grp.matches) {
          let t1w = 0, t2w = 0, pd = 0;
          for (const g of m.games) {
            const w = gameWinner(g.team1Score, g.team2Score);
            if (w === 'team1') t1w++; else if (w === 'team2') t2w++;
            pd += g.team1Score - g.team2Score;
          }
          const t1wins = t1w > t2w || (t1w === t2w && pd > 0);
          wins[t1wins ? m.team1Id : m.team2Id] = (wins[t1wins ? m.team1Id : m.team2Id] ?? 0) + 1;
          diff[m.team1Id] = (diff[m.team1Id] ?? 0) + pd;
          diff[m.team2Id] = (diff[m.team2Id] ?? 0) - pd;
        }
      }
      const allTeams = lastLevel.groups.flatMap(g => g.teams);
      const ranked = allTeams.sort((a, b) => (wins[b.id] ?? 0) !== (wins[a.id] ?? 0) ? (wins[b.id] ?? 0) - (wins[a.id] ?? 0) : (diff[b.id] ?? 0) - (diff[a.id] ?? 0));
      winnerTeamId = ranked[0]?.id ?? null;
      runnerUpTeamId = ranked[1]?.id ?? null;
    }

    const allTeams = lastLevel.groups.flatMap(g => g.teams);
    const winnerTeam = allTeams.find(tm => tm.id === winnerTeamId);
    const runnerUpTeam = allTeams.find(tm => tm.id === runnerUpTeamId);
    for (const name of (winnerTeam?.players ?? [])) { if (name) { const s = get(name); s.bonusPts += 2; s.points += 2; } }
    for (const name of (runnerUpTeam?.players ?? [])) { if (name) { const s = get(name); s.bonusPts += 1; s.points += 1; } }
  }

  return Array.from(map.values()).sort((a, b) => b.points !== a.points ? b.points - a.points : b.gameWins - a.gameWins);
}

function sanitizeKey(name) { return name.replace(/[.#$[\]/]/g, '_'); }

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  console.log('Reading tournaments from Firebase...');
  const snap = await get(ref(db, 'tournaments'));
  const raw = snap.val();
  if (!raw) { console.log('No tournaments found.'); process.exit(0); }

  const tournaments = Object.values(raw).map(normalizeTournament);
  console.log(`Found ${tournaments.length} tournament(s).`);

  const rankings = computePlayerRankings(tournaments);
  console.log(`Computed rankings for ${rankings.length} player(s):`);
  rankings.forEach((r, i) => console.log(`  ${i + 1}. ${r.name} — ${r.points} pts (P:${r.participationPts} G:${r.gameWinPts} B:${r.bonusPts})`));

  const obj = Object.fromEntries(rankings.map(r => [sanitizeKey(r.name), r]));
  await set(ref(db, 'rankings'), obj);
  console.log('\n✓ Rankings saved to Firebase /rankings');

  process.exit(0);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
