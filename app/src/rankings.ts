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

// Shared output type for both rating algorithms
export interface PlayerRatingEntry {
  name: string;
  rating: number;       // display-scale rating
  uncertainty: number;  // SD (RC) or RD (Glicko-2) — lower = more certain
  volatility?: number;  // Glicko-2 σ only
  won: number;
  lost: number;
  gamesPlayed: number;
}

// Keep RCRating as alias for back-compat
export type RCRating = PlayerRatingEntry;

// Glicko-style attenuation of opponent uncertainty
function rcG(sd: number): number {
  return 1 / Math.sqrt(1 + 3 * RC_ALPHA * RC_ALPHA * sd * sd / (Math.PI * Math.PI));
}

function rcE(r: number, rOpp: number, sdOpp: number): number {
  return 1 / (1 + Math.exp(-rcG(sdOpp) * RC_ALPHA * (r - rOpp)));
}

function rcUpdate(
  rating: number, sd: number,
  results: { rOpp: number; sdOpp: number; score: number }[],
): { rating: number; uncertainty: number } {
  if (results.length === 0) return { rating, uncertainty: sd };
  const dSqInv = RC_ALPHA * RC_ALPHA * results.reduce((s, r) => {
    const g = rcG(r.sdOpp); const e = rcE(rating, r.rOpp, r.sdOpp);
    return s + g * g * e * (1 - e);
  }, 0);
  const dSq = 1 / dSqInv;
  const delta = RC_ALPHA * dSq * results.reduce((s, r) =>
    s + rcG(r.sdOpp) * (r.score - rcE(rating, r.rOpp, r.sdOpp)), 0);
  return {
    rating: rating + delta,
    uncertainty: Math.max(Math.sqrt(1 / (1 / (sd * sd) + 1 / dSq)), RC_MIN_SD),
  };
}

function applyRCGame(
  map: Map<string, PlayerRatingEntry>,
  game: BaselineGame,
): void {
  const team1Won = game.winner === 1;
  const isDoubles = game.type === 'doubles';

  function get(name: string): PlayerRatingEntry {
    if (!map.has(name)) map.set(name, { name, rating: RC_INITIAL_RATING, uncertainty: RC_INITIAL_SD, won: 0, lost: 0, gamesPlayed: 0 });
    return map.get(name)!;
  }

  const pre = new Map<string, PlayerRatingEntry>();
  [...game.team1, ...game.team2].forEach(n => pre.set(n, { ...get(n) }));

  const update = (name: string, opponents: string[], won: boolean) => {
    const p = pre.get(name)!;
    const results = opponents.map(opp => {
      const o = pre.get(opp)!;
      return { rOpp: o.rating, sdOpp: o.uncertainty, score: won ? 1 : 0 };
    });
    const u = rcUpdate(p.rating, p.uncertainty, results);
    const cur = get(name);
    map.set(name, { ...cur, ...u, won: cur.won + (won ? 1 : 0), lost: cur.lost + (won ? 0 : 1), gamesPlayed: cur.gamesPlayed + 1 });
  };

  if (!isDoubles) {
    update(game.team1[0], game.team2, team1Won);
    update(game.team2[0], game.team1, !team1Won);
  } else {
    game.team1.forEach(n => update(n, game.team2, team1Won));
    game.team2.forEach(n => update(n, game.team1, !team1Won));
  }
}

export function computeRCRatings(games: BaselineGame[], type: 'singles' | 'doubles'): PlayerRatingEntry[] {
  const map = new Map<string, PlayerRatingEntry>();
  [...games].filter(g => g.type === type).sort((a, b) => a.createdAt - b.createdAt)
    .forEach(g => applyRCGame(map, g));
  return Array.from(map.values()).sort((a, b) => b.rating - a.rating);
}

// ---------------------------------------------------------------------------
// Glicko-2 rating system
// Glickman (2001) — full spec with volatility via Illinois algorithm
// ---------------------------------------------------------------------------

const G2_SCALE = 173.7178;         // converts display ↔ internal scale
const G2_INIT_R = 1500;            // initial display rating
const G2_INIT_RD = 350;            // initial rating deviation (display)
const G2_INIT_SIGMA = 0.06;        // initial volatility
const G2_TAU = 0.5;                // system constant (constrains σ change)
const G2_MIN_RD = 30;              // floor RD (display)
const G2_EPSILON = 0.000001;       // Illinois convergence tolerance

interface G2State { mu: number; phi: number; sigma: number }

function g2G(phi: number): number {
  return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
}

function g2E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g2G(phiJ) * (mu - muJ)));
}

// Illinois algorithm to find new volatility σ'
function g2NewSigma(phi: number, sigma: number, v: number, delta: number): number {
  const a = Math.log(sigma * sigma);
  const dSq = delta * delta;
  const phiSq = phi * phi;

  function f(x: number): number {
    const ex = Math.exp(x);
    return (ex * (dSq - phiSq - v - ex)) / (2 * Math.pow(phiSq + v + ex, 2))
      - (x - a) / (G2_TAU * G2_TAU);
  }

  let A = a;
  let B = dSq > phiSq + v ? Math.log(dSq - phiSq - v) : (() => {
    let k = 1; while (f(a - k * G2_TAU) < 0) k++; return a - k * G2_TAU;
  })();

  let fA = f(A), fB = f(B);
  while (Math.abs(B - A) > G2_EPSILON) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) { A = B; fA = fB; } else { fA /= 2; }
    B = C; fB = fC;
  }
  return Math.exp(A / 2);
}

function g2Update(state: G2State, results: { muJ: number; phiJ: number; score: number }[]): G2State {
  if (results.length === 0) {
    const phiStar = Math.min(Math.sqrt(state.phi * state.phi + state.sigma * state.sigma), G2_INIT_RD / G2_SCALE);
    return { ...state, phi: phiStar };
  }

  const v = 1 / results.reduce((s, r) => {
    const g = g2G(r.phiJ); const e = g2E(state.mu, r.muJ, r.phiJ);
    return s + g * g * e * (1 - e);
  }, 0);

  const delta = v * results.reduce((s, r) =>
    s + g2G(r.phiJ) * (r.score - g2E(state.mu, r.muJ, r.phiJ)), 0);

  const newSigma = g2NewSigma(state.phi, state.sigma, v, delta);
  const phiStar = Math.sqrt(state.phi * state.phi + newSigma * newSigma);
  const newPhi = Math.max(1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v), G2_MIN_RD / G2_SCALE);
  const newMu = state.mu + newPhi * newPhi * results.reduce((s, r) =>
    s + g2G(r.phiJ) * (r.score - g2E(state.mu, r.muJ, r.phiJ)), 0);

  return { mu: newMu, phi: newPhi, sigma: newSigma };
}

function applyG2Game(
  map: Map<string, { entry: PlayerRatingEntry; g2: G2State }>,
  game: BaselineGame,
): void {
  const team1Won = game.winner === 1;

  function get(name: string) {
    if (!map.has(name)) {
      const g2: G2State = { mu: 0, phi: G2_INIT_RD / G2_SCALE, sigma: G2_INIT_SIGMA };
      const entry: PlayerRatingEntry = { name, rating: G2_INIT_R, uncertainty: G2_INIT_RD, volatility: G2_INIT_SIGMA, won: 0, lost: 0, gamesPlayed: 0 };
      map.set(name, { entry, g2 });
    }
    return map.get(name)!;
  }

  const pre = new Map<string, { entry: PlayerRatingEntry; g2: G2State }>();
  [...game.team1, ...game.team2].forEach(n => { const v = get(n); pre.set(n, { entry: { ...v.entry }, g2: { ...v.g2 } }); });

  const update = (name: string, opponents: string[], won: boolean) => {
    const { g2 } = pre.get(name)!;
    const results = opponents.map(opp => {
      const o = pre.get(opp)!.g2;
      return { muJ: o.mu, phiJ: o.phi, score: won ? 1 : 0 };
    });
    const newG2 = g2Update(g2, results);
    const newRating = G2_SCALE * newG2.mu + G2_INIT_R;
    const newRD = G2_SCALE * newG2.phi;
    const cur = get(name);
    map.set(name, {
      g2: newG2,
      entry: { ...cur.entry, rating: newRating, uncertainty: newRD, volatility: newG2.sigma, won: cur.entry.won + (won ? 1 : 0), lost: cur.entry.lost + (won ? 0 : 1), gamesPlayed: cur.entry.gamesPlayed + 1 },
    });
  };

  if (game.type !== 'doubles') {
    update(game.team1[0], game.team2, team1Won);
    update(game.team2[0], game.team1, !team1Won);
  } else {
    game.team1.forEach(n => update(n, game.team2, team1Won));
    game.team2.forEach(n => update(n, game.team1, !team1Won));
  }
}

export function computeGlicko2Ratings(games: BaselineGame[], type: 'singles' | 'doubles'): PlayerRatingEntry[] {
  const map = new Map<string, { entry: PlayerRatingEntry; g2: G2State }>();
  [...games].filter(g => g.type === type).sort((a, b) => a.createdAt - b.createdAt)
    .forEach(g => applyG2Game(map, g));
  return Array.from(map.values()).map(v => v.entry).sort((a, b) => b.rating - a.rating);
}
