import type { Group, Match, MatchFormat, Team, TeamStats, Tournament, PlayerRatingEntry, CompetitiveMatch } from './types';
export type { }; // keep module

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

export interface H2HRecord {
  opponent: string;
  gameWins: number;
  gameLosses: number;
}

export interface TournamentPerf {
  id: string;
  name: string;
  date?: string;
  gameWins: number;
  gameLosses: number;
}

export interface PlayerStats {
  name: string;
  overall: { matchesPlayed: number; matchWins: number; gameWins: number; gameLosses: number; pointsFor: number; pointsAgainst: number };
  singles: { matchesPlayed: number; matchWins: number; gameWins: number; gameLosses: number; pointsFor: number; pointsAgainst: number };
  doubles: { matchesPlayed: number; matchWins: number; gameWins: number; gameLosses: number; pointsFor: number; pointsAgainst: number };
  tournaments: { id: string; name: string; date?: string; matchType?: string; result: 'winner' | 'runner-up' | null }[];
  headToHead: H2HRecord[];
  tournamentPerf: TournamentPerf[];
}

function blankBucket() {
  return { matchesPlayed: 0, matchWins: 0, gameWins: 0, gameLosses: 0, pointsFor: 0, pointsAgainst: 0 };
}

function accumulateGame(
  game: { team1Score: number; team2Score: number },
  isTeam1: boolean,
  matchWon: boolean,
  bucket: PlayerStats['overall'],
  overall: PlayerStats['overall'],
) {
  const my = isTeam1 ? game.team1Score : game.team2Score;
  const opp = isTeam1 ? game.team2Score : game.team1Score;
  const w = gameWinner(game.team1Score, game.team2Score);
  const iWon = isTeam1 ? w === 'team1' : w === 'team2';
  bucket.pointsFor += my; overall.pointsFor += my;
  bucket.pointsAgainst += opp; overall.pointsAgainst += opp;
  if (iWon) { bucket.gameWins++; overall.gameWins++; }
  else if (w) { bucket.gameLosses++; overall.gameLosses++; }
  void matchWon;
}

export function computePlayerStats(
  playerName: string,
  tournaments: Tournament[],
  competitiveMatches: CompetitiveMatch[] = [],
): PlayerStats {
  const stats: PlayerStats = {
    name: playerName,
    overall: blankBucket(),
    singles: blankBucket(),
    doubles: blankBucket(),
    tournaments: [],
    headToHead: [],
    tournamentPerf: [],
  };
  const h2hMap = new Map<string, { gameWins: number; gameLosses: number }>();
  function addH2H(opponents: string[], gw: number, gl: number) {
    for (const opp of opponents) {
      const cur = h2hMap.get(opp) ?? { gameWins: 0, gameLosses: 0 };
      h2hMap.set(opp, { gameWins: cur.gameWins + gw, gameLosses: cur.gameLosses + gl });
    }
  }

  for (const t of tournaments) {
    let appearedInTournament = false;
    let result: 'winner' | 'runner-up' | null = null;
    let tGW = 0, tGL = 0;

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
          const oppTeam = isTeam1 ? team2 : team1;
          const mtype = myTeam.type === 'singles' ? 'singles' : (t.matchType ?? 'doubles');
          const bucket = mtype === 'singles' ? stats.singles : stats.doubles;
          let gw = 0, gl = 0;
          for (const game of match.games) {
            const w = gameWinner(game.team1Score, game.team2Score);
            const iWon = isTeam1 ? w === 'team1' : w === 'team2';
            if (iWon) gw++; else if (w) gl++;
          }
          const matchWon = gw > gl;
          bucket.matchesPlayed++; stats.overall.matchesPlayed++;
          bucket.matchWins += matchWon ? 1 : 0; stats.overall.matchWins += matchWon ? 1 : 0;
          tGW += gw; tGL += gl;
          for (const game of match.games) {
            accumulateGame(game, isTeam1, matchWon, bucket, stats.overall);
          }
          if (oppTeam) addH2H(oppTeam.players, gw, gl);
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
      stats.tournamentPerf.push({ id: t.id, name: t.name, date: t.date, gameWins: tGW, gameLosses: tGL });
    }
  }

  // Competitive matches (singles and doubles)
  for (const m of competitiveMatches) {
    const isTeam1 = m.team1.includes(playerName);
    const isTeam2 = m.team2.includes(playerName);
    if (!isTeam1 && !isTeam2) continue;
    const bucket = m.type === 'singles' ? stats.singles : stats.doubles;
    const matchWon = isTeam1 ? m.winner === 1 : m.winner === 2;
    bucket.matchesPlayed++; stats.overall.matchesPlayed++;
    bucket.matchWins += matchWon ? 1 : 0; stats.overall.matchWins += matchWon ? 1 : 0;
    let cgw = 0, cgl = 0;
    for (const game of m.games) {
      accumulateGame(game, isTeam1, matchWon, bucket, stats.overall);
      const w = gameWinner(game.team1Score, game.team2Score);
      const iWon = isTeam1 ? w === 'team1' : w === 'team2';
      if (iWon) cgw++; else if (w) cgl++;
    }
    const opps = isTeam1 ? m.team2 : m.team1;
    addH2H(opps, cgw, cgl);
  }

  stats.headToHead = [...h2hMap.entries()]
    .map(([opponent, r]) => ({ opponent, ...r }))
    .sort((a, b) => (b.gameWins + b.gameLosses) - (a.gameWins + a.gameLosses));

  stats.tournamentPerf.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  return stats;
}


export type CombinedEntry = {
  name: string;
  rating: number;
  prevRating?: number;
  uncertainty: number;
  won: number;
  lost: number;
  gamesPlayed: number;
  hasSingles: boolean;
  hasDoubles: boolean;
};

export function buildCombined(ratings: PlayerRatingEntry[], algo: string): CombinedEntry[] {
  const map = new Map<string, CombinedEntry>();
  for (const r of ratings.filter(r => r.algo === algo)) {
    const cur = map.get(r.name);
    if (!cur) {
      map.set(r.name, {
        name: r.name,
        rating: r.rating,
        prevRating: r.prevRating,
        uncertainty: r.uncertainty,
        won: r.won,
        lost: r.lost,
        gamesPlayed: r.gamesPlayed,
        hasSingles: r.type === 'singles',
        hasDoubles: r.type === 'doubles',
      });
    } else {
      const totalGames = cur.gamesPlayed + r.gamesPlayed;
      const weightedRating = totalGames > 0
        ? (cur.rating * cur.gamesPlayed + r.rating * r.gamesPlayed) / totalGames
        : (cur.rating + r.rating) / 2;
      const weightedUncertainty = totalGames > 0
        ? (cur.uncertainty * cur.gamesPlayed + r.uncertainty * r.gamesPlayed) / totalGames
        : (cur.uncertainty + r.uncertainty) / 2;
      const prevR = cur.prevRating !== undefined && r.prevRating !== undefined
        ? totalGames > 0
          ? (cur.prevRating * cur.gamesPlayed + r.prevRating * r.gamesPlayed) / totalGames
          : (cur.prevRating + r.prevRating) / 2
        : (cur.prevRating ?? r.prevRating);
      map.set(r.name, {
        name: r.name,
        rating: weightedRating,
        prevRating: prevR,
        uncertainty: weightedUncertainty,
        won: cur.won + r.won,
        lost: cur.lost + r.lost,
        gamesPlayed: totalGames,
        hasSingles: cur.hasSingles || r.type === 'singles',
        hasDoubles: cur.hasDoubles || r.type === 'doubles',
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    if (b.won !== a.won) return b.won - a.won;
    return b.rating - a.rating;
  });
}

export function winProbability(
  team1Players: string[],
  team2Players: string[],
  ratings: PlayerRatingEntry[],
  matchType: 'singles' | 'doubles',
  algo: string,
): { p1: number; p2: number } | null {
  const algoRatings = ratings.filter(r => r.algo === algo);
  const pool = algoRatings.length > 0 ? algoRatings : ratings;
  const byType = pool.filter(r => r.type === matchType);
  const source = byType.length > 0 ? byType : pool;
  const ratingMap = new Map(source.map(r => [r.name, r.rating]));
  const avg = (players: string[]) => {
    const vals = players.map(p => ratingMap.get(p)).filter((v): v is number => v !== undefined);
    return vals.length === players.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const r1 = avg(team1Players);
  const r2 = avg(team2Players);
  if (r1 === null || r2 === null) return null;
  const p1 = 1 / (1 + Math.pow(10, (r2 - r1) / 400));
  return { p1, p2: 1 - p1 };
}

export interface PlayerStreak {
  count: number;
  type: 'win' | 'loss';
}

export function computeStreaks(matches: CompetitiveMatch[]): Map<string, PlayerStreak> {
  const sorted = [...matches].sort((a, b) => {
    if (a.date !== b.date) return (a.date ?? '').localeCompare(b.date ?? '');
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });

  const result = new Map<string, PlayerStreak>();

  const allPlayers = new Set(sorted.flatMap(m => [...m.team1, ...m.team2]));
  for (const player of allPlayers) {
    let count = 0;
    let type: 'win' | 'loss' | null = null;
    for (const m of sorted) {
      const onTeam1 = m.team1.includes(player);
      const onTeam2 = m.team2.includes(player);
      if (!onTeam1 && !onTeam2) continue;
      const won = onTeam1 ? m.winner === 1 : m.winner === 2;
      const cur: 'win' | 'loss' = won ? 'win' : 'loss';
      if (cur === type) {
        count++;
      } else {
        type = cur;
        count = 1;
      }
    }
    if (type && count >= 1) result.set(player, { count, type });
  }
  return result;
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

