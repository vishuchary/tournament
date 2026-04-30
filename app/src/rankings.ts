import type { Group, Match, MatchFormat, Team, TeamStats, Tournament, BaselineGame } from './types';

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const base = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return base.slice(0, 8);
}

export function teamDisplayName(team: Team): string {
  const players = team.players.filter(Boolean);
  if (players.length === 0) return team.name;
  return players.map(shortName).join('_');
}

export interface PlayerRanking {
  name: string;
  points: number;        // total score
  participationPts: number; // +2 per level played
  gameWinPts: number;   // +2 per game won
  bonusPts: number;     // +2 winner, +1 runner-up per tournament
  gameWins: number;     // raw game win count
  matchesPlayed: number;
}

function gameWinner(s1: number, s2: number): 'team1' | 'team2' | null {
  if (s1 >= 11 && s1 - s2 >= 2) return 'team1';
  if (s2 >= 11 && s2 - s1 >= 2) return 'team2';
  return null;
}

function getMatchResult(match: Match, teamId: string, format: MatchFormat) {
  const isTeam1 = match.team1Id === teamId;
  let setsWon = 0, setsLost = 0, gameWins = 0, gameLosses = 0;
  let pointsFor = 0, pointsAgainst = 0;

  for (const game of match.games) {
    const myScore = isTeam1 ? game.team1Score : game.team2Score;
    const oppScore = isTeam1 ? game.team2Score : game.team1Score;
    pointsFor += myScore;
    pointsAgainst += oppScore;
    const w = gameWinner(game.team1Score, game.team2Score);
    const iWon = isTeam1 ? w === 'team1' : w === 'team2';
    const iLost = isTeam1 ? w === 'team2' : w === 'team1';
    if (iWon) { setsWon++; gameWins++; }
    else if (iLost) { setsLost++; gameLosses++; }
  }

  // Match win: sets format = more sets; games format = more game wins
  const matchWon = format === 'sets'
    ? setsWon > setsLost
    : gameWins > gameLosses;

  return { matchWon, setsWon, setsLost, gameWins, gameLosses, pointsFor, pointsAgainst };
}

export function computeStandings(group: Group, format: MatchFormat): TeamStats[] {
  const statsMap = new Map<string, TeamStats>();

  for (const team of group.teams) {
    statsMap.set(team.id, {
      team,
      matchesPlayed: 0,
      matchWins: 0,
      matchLosses: 0,
      setWins: 0,
      setLosses: 0,
      gameWins: 0,
      gameLosses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      rank: 0,
    });
  }

  for (const match of group.matches) {
    if (!match.completed) continue;

    for (const teamId of [match.team1Id, match.team2Id]) {
      const s = statsMap.get(teamId);
      if (!s) continue;
      const r = getMatchResult(match, teamId, format);
      s.matchesPlayed++;
      if (r.matchWon) s.matchWins++; else s.matchLosses++;
      s.setWins += r.setsWon;
      s.setLosses += r.setsLost;
      s.gameWins += r.gameWins;
      s.gameLosses += r.gameLosses;
      s.pointsFor += r.pointsFor;
      s.pointsAgainst += r.pointsAgainst;
      s.pointDiff = s.pointsFor - s.pointsAgainst;
    }
  }

  const standings = Array.from(statsMap.values());

  standings.sort((a, b) => {
    // Sets format: rank by match wins. Games format: rank by total game wins.
    const primary = format === 'sets'
      ? b.matchWins - a.matchWins
      : b.gameWins - a.gameWins;
    if (primary !== 0) return primary;
    return b.pointDiff - a.pointDiff;
  });

  standings.forEach((s, i) => { s.rank = i + 1; });
  return standings;
}

export function computeCrossGroupRankings(groups: Group[], format: MatchFormat): TeamStats[] {
  const all = groups.flatMap(g => computeStandings(g, format));
  all.sort((a, b) => {
    if (format === 'sets') {
      if (b.matchWins !== a.matchWins) return b.matchWins - a.matchWins;
      if (b.setWins !== a.setWins) return b.setWins - a.setWins;
    } else {
      if (b.gameWins !== a.gameWins) return b.gameWins - a.gameWins;
    }
    return b.pointDiff - a.pointDiff;
  });
  all.forEach((s, i) => { s.rank = i + 1; });
  return all;
}

export interface PlayerStats {
  name: string;
  overall: { matchesPlayed: number; matchWins: number; gameWins: number; gameLosses: number; pointsFor: number; pointsAgainst: number };
  singles: { matchesPlayed: number; matchWins: number; gameWins: number; gameLosses: number; pointsFor: number; pointsAgainst: number };
  doubles: { matchesPlayed: number; matchWins: number; gameWins: number; gameLosses: number; pointsFor: number; pointsAgainst: number };
  tournaments: { id: string; name: string; date?: string; matchType?: string; result: 'winner' | 'runner-up' | null }[];
}

function blankBucket() {
  return { matchesPlayed: 0, matchWins: 0, gameWins: 0, gameLosses: 0, pointsFor: 0, pointsAgainst: 0 };
}

export function computePlayerStats(playerName: string, tournaments: Tournament[]): PlayerStats {
  const stats: PlayerStats = {
    name: playerName,
    overall: blankBucket(),
    singles: blankBucket(),
    doubles: blankBucket(),
    tournaments: [],
  };

  for (const t of tournaments) {
    const bucket = t.matchType === 'singles' ? stats.singles : stats.doubles;
    let appearedInTournament = false;
    let result: 'winner' | 'runner-up' | null = null;

    for (const level of t.levels) {
      for (const group of level.groups) {
        const teamMap = new Map(group.teams.map(tm => [tm.id, tm]));
        for (const match of group.matches) {
          if (!match.completed) continue;
          const team1 = teamMap.get(match.team1Id);
          const team2 = teamMap.get(match.team2Id);
          const myTeam = [team1, team2].find(tm => tm?.players.includes(playerName));
          if (!myTeam) continue;
          appearedInTournament = true;
          const isTeam1 = myTeam.id === match.team1Id;
          let gw = 0, gl = 0, pf = 0, pa = 0;
          for (const game of match.games) {
            const my = isTeam1 ? game.team1Score : game.team2Score;
            const opp = isTeam1 ? game.team2Score : game.team1Score;
            pf += my; pa += opp;
            const w = gameWinner(game.team1Score, game.team2Score);
            const iWon = isTeam1 ? w === 'team1' : w === 'team2';
            if (iWon) gw++; else if (w) gl++;
          }
          const mw = gw > gl ? 1 : 0;
          bucket.matchesPlayed++; stats.overall.matchesPlayed++;
          bucket.matchWins += mw; stats.overall.matchWins += mw;
          bucket.gameWins += gw; stats.overall.gameWins += gw;
          bucket.gameLosses += gl; stats.overall.gameLosses += gl;
          bucket.pointsFor += pf; stats.overall.pointsFor += pf;
          bucket.pointsAgainst += pa; stats.overall.pointsAgainst += pa;
        }
      }
    }

    const lastLevel = t.levels[t.levels.length - 1];
    if (lastLevel) {
      const allTeams = lastLevel.groups.flatMap(g => g.teams);
      const isFinals = lastLevel.groups.length === 1 && lastLevel.groups[0].teams.length === 2;
      let winnerTeamId: string | null = null;
      let runnerUpTeamId: string | null = null;
      if (isFinals && lastLevel.groups[0].matches[0]?.completed) {
        const fm = lastLevel.groups[0].matches[0];
        let t1w = 0, t2w = 0, pd = 0;
        for (const g of fm.games) {
          const w = gameWinner(g.team1Score, g.team2Score);
          if (w === 'team1') t1w++; else if (w === 'team2') t2w++;
          pd += g.team1Score - g.team2Score;
        }
        const t1Wins = t1w !== t2w ? t1w > t2w : pd > 0;
        winnerTeamId = t1Wins ? fm.team1Id : fm.team2Id;
        runnerUpTeamId = t1Wins ? fm.team2Id : fm.team1Id;
      } else if (!isFinals) {
        const st = computeCrossGroupRankings(lastLevel.groups, t.format);
        winnerTeamId = st[0]?.team.id ?? null;
        runnerUpTeamId = st[1]?.team.id ?? null;
      }
      const winnerTeam = allTeams.find(tm => tm.id === winnerTeamId);
      const runnerUpTeam = allTeams.find(tm => tm.id === runnerUpTeamId);
      if (winnerTeam?.players.includes(playerName)) result = 'winner';
      else if (runnerUpTeam?.players.includes(playerName)) result = 'runner-up';
    }

    if (appearedInTournament) {
      stats.tournaments.push({ id: t.id, name: t.name, date: t.date, matchType: t.matchType, result });
    }
  }

  return stats;
}

export function computePlayerRankings(tournaments: Tournament[], matchType?: 'singles' | 'doubles'): PlayerRanking[] {
  const filtered = matchType ? tournaments.filter(t => t.matchType === matchType) : tournaments;
  const map = new Map<string, PlayerRanking>();

  function get(name: string): PlayerRanking {
    if (!map.has(name)) map.set(name, {
      name, points: 0, participationPts: 0, gameWinPts: 0, bonusPts: 0,
      gameWins: 0, matchesPlayed: 0,
    });
    return map.get(name)!;
  }

  for (const t of filtered) {
    // 1. Level participation: +2 per level per player
    for (const level of t.levels) {
      const levelPlayers = new Set<string>();
      for (const group of level.groups) {
        for (const team of group.teams) {
          for (const name of team.players) {
            if (name) levelPlayers.add(name);
          }
        }
      }
      for (const name of levelPlayers) {
        const s = get(name);
        s.participationPts += 2;
        s.points += 2;
      }
    }

    // 2. Game wins: +2 per individual game won
    for (const level of t.levels) {
      for (const group of level.groups) {
        const teamMap = new Map(group.teams.map(tm => [tm.id, tm]));
        for (const match of group.matches) {
          if (!match.completed || match.games.length === 0) continue;

          const inMatch = new Set<string>();
          const team1 = teamMap.get(match.team1Id);
          const team2 = teamMap.get(match.team2Id);
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

    // 3. Tournament winner (+2) and runner-up (+1) — based on last level
    const lastLevel = t.levels[t.levels.length - 1];
    if (!lastLevel) continue;
    const lastMatches = lastLevel.groups.flatMap(g => g.matches);
    if (lastMatches.length === 0 || !lastMatches.every(m => m.completed)) continue;

    let winnerTeamId: string | null = null;
    let runnerUpTeamId: string | null = null;

    const isFinals = lastLevel.groups.length === 1 && lastLevel.groups[0].teams.length === 2;
    if (isFinals) {
      const finalMatch = lastLevel.groups[0].matches[0];
      if (finalMatch?.completed) {
        let t1wins = 0, t2wins = 0, pointDiff = 0;
        for (const g of finalMatch.games) {
          const w = gameWinner(g.team1Score, g.team2Score);
          if (w === 'team1') t1wins++;
          else if (w === 'team2') t2wins++;
          pointDiff += g.team1Score - g.team2Score;
        }
        let team1Wins: boolean;
        if (t1wins !== t2wins) team1Wins = t1wins > t2wins;
        else if (pointDiff !== 0) team1Wins = pointDiff > 0;
        else continue;
        winnerTeamId = team1Wins ? finalMatch.team1Id : finalMatch.team2Id;
        runnerUpTeamId = team1Wins ? finalMatch.team2Id : finalMatch.team1Id;
      }
    } else {
      const standings = computeCrossGroupRankings(lastLevel.groups, t.format);
      winnerTeamId = standings[0]?.team.id ?? null;
      runnerUpTeamId = standings[1]?.team.id ?? null;
    }

    const allTeams = lastLevel.groups.flatMap(g => g.teams);
    const winnerTeam = allTeams.find(tm => tm.id === winnerTeamId);
    const runnerUpTeam = allTeams.find(tm => tm.id === runnerUpTeamId);

    for (const name of (winnerTeam?.players ?? [])) {
      if (!name) continue;
      const s = get(name);
      s.bonusPts += 2;
      s.points += 2;
    }
    for (const name of (runnerUpTeam?.players ?? [])) {
      if (!name) continue;
      const s = get(name);
      s.bonusPts += 1;
      s.points += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    b.points !== a.points ? b.points - a.points : b.gameWins - a.gameWins
  );
}

export function generateMatches(teams: Team[]): { team1Id: string; team2Id: string }[] {
  const pairs: { team1Id: string; team2Id: string }[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push({ team1Id: teams[i].id, team2Id: teams[j].id });
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Ratings Central rating system
// Based on: Marcus (2001) "New Table-Tennis Rating System", J Royal Stat Soc
// ---------------------------------------------------------------------------

// α = 0.0148540595817432 is the official Ratings Central logistic scale
const RC_ALPHA = 0.0148540595817432;
const RC_INITIAL_RATING = 1400;
const RC_INITIAL_SD = 450;
const RC_MIN_SD = 50;

export interface RCRating {
  name: string;
  rating: number;
  sd: number;        // standard deviation — lower = more certain
  won: number;
  lost: number;
  gamesPlayed: number;
}

// Glicko-style attenuation of opponent SD
function rcG(sd: number): number {
  return 1 / Math.sqrt(1 + 3 * RC_ALPHA * RC_ALPHA * sd * sd / (Math.PI * Math.PI));
}

// Expected score for player with rating r vs opponent (rOpp, sdOpp)
function rcE(r: number, rOpp: number, sdOpp: number): number {
  return 1 / (1 + Math.exp(-rcG(sdOpp) * RC_ALPHA * (r - rOpp)));
}

// Bayesian update: apply a batch of results to a player
function rcUpdate(
  rating: number,
  sd: number,
  results: { rOpp: number; sdOpp: number; score: number }[], // score: 1=win, 0=loss
): { rating: number; sd: number } {
  if (results.length === 0) return { rating, sd };

  const dSqInv = RC_ALPHA * RC_ALPHA * results.reduce((s, r) => {
    const g = rcG(r.sdOpp);
    const e = rcE(rating, r.rOpp, r.sdOpp);
    return s + g * g * e * (1 - e);
  }, 0);

  const dSq = 1 / dSqInv;
  const delta = RC_ALPHA * dSq * results.reduce((s, r) => {
    return s + rcG(r.sdOpp) * (r.score - rcE(rating, r.rOpp, r.sdOpp));
  }, 0);

  const newRating = rating + delta;
  const newSd = Math.max(Math.sqrt(1 / (1 / (sd * sd) + 1 / dSq)), RC_MIN_SD);
  return { rating: newRating, sd: newSd };
}

export function computeRCRatings(games: BaselineGame[], type: 'singles' | 'doubles'): RCRating[] {
  const map = new Map<string, RCRating>();

  function get(name: string): RCRating {
    if (!map.has(name)) map.set(name, {
      name, rating: RC_INITIAL_RATING, sd: RC_INITIAL_SD,
      won: 0, lost: 0, gamesPlayed: 0,
    });
    return map.get(name)!;
  }

  const sorted = [...games]
    .filter(g => g.type === type)
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const game of sorted) {
    const team1Won = game.winner === 1;

    if (type === 'singles') {
      const p1 = get(game.team1[0]);
      const p2 = get(game.team2[0]);
      // Use pre-game ratings for both updates (simultaneous)
      const u1 = rcUpdate(p1.rating, p1.sd, [{ rOpp: p2.rating, sdOpp: p2.sd, score: team1Won ? 1 : 0 }]);
      const u2 = rcUpdate(p2.rating, p2.sd, [{ rOpp: p1.rating, sdOpp: p1.sd, score: team1Won ? 0 : 1 }]);
      map.set(game.team1[0], { ...p1, ...u1, won: p1.won + (team1Won ? 1 : 0), lost: p1.lost + (team1Won ? 0 : 1), gamesPlayed: p1.gamesPlayed + 1 });
      map.set(game.team2[0], { ...p2, ...u2, won: p2.won + (team1Won ? 0 : 1), lost: p2.lost + (team1Won ? 1 : 0), gamesPlayed: p2.gamesPlayed + 1 });
    } else {
      // Doubles: each player rated against each opponent individually
      // Read all pre-game ratings first, then apply updates
      const pre = new Map<string, RCRating>();
      [...game.team1, ...game.team2].forEach(n => pre.set(n, { ...get(n) }));

      game.team1.forEach(name => {
        const p = pre.get(name)!;
        const results = game.team2.map(opp => {
          const o = pre.get(opp)!;
          return { rOpp: o.rating, sdOpp: o.sd, score: team1Won ? 1 : 0 };
        });
        const u = rcUpdate(p.rating, p.sd, results);
        map.set(name, { ...get(name), ...u, won: get(name).won + (team1Won ? 1 : 0), lost: get(name).lost + (team1Won ? 0 : 1), gamesPlayed: get(name).gamesPlayed + 1 });
      });

      game.team2.forEach(name => {
        const p = pre.get(name)!;
        const results = game.team1.map(opp => {
          const o = pre.get(opp)!;
          return { rOpp: o.rating, sdOpp: o.sd, score: team1Won ? 0 : 1 };
        });
        const u = rcUpdate(p.rating, p.sd, results);
        map.set(name, { ...get(name), ...u, won: get(name).won + (team1Won ? 0 : 1), lost: get(name).lost + (team1Won ? 1 : 0), gamesPlayed: get(name).gamesPlayed + 1 });
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.rating - a.rating);
}
