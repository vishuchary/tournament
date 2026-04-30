export type MatchFormat = 'sets' | 'games';

export interface Player {
  id: string;
  name: string;
  sex?: 'male' | 'female';
  hand?: 'right' | 'left';
  place?: string;
}

export interface Team {
  id: string;
  name: string;
  type: 'singles' | 'doubles';
  players: string[];
}

export interface Game {
  team1Score: number;
  team2Score: number;
}

export interface Match {
  id: string;
  team1Id: string;
  team2Id: string;
  games: Game[];
  completed: boolean;
}

export interface Group {
  id: string;
  name: string;
  teams: Team[];
  matches: Match[];
}

export interface TournamentLevel {
  id: string;
  name: string;
  groups: Group[];
  setCount?: number; // overrides tournament-level setCount for this level
}

export interface Tournament {
  id: string;
  name: string;
  format: MatchFormat;
  setCount?: number;   // sets format: odd number (1,3,5…); games format: any number; default 3/2
  matchType?: 'singles' | 'doubles';
  levels: TournamentLevel[];
  createdAt: number;
  date?: string; // YYYY-MM-DD, the day the tournament is played
}

export interface BaselineGame {
  id: string;
  type: 'singles' | 'doubles';
  team1: string[];   // player name(s)
  team2: string[];   // player name(s)
  games: Game[];     // per-game scores
  winner: 1 | 2;
  setCount: number;  // number of games played (e.g. 3 = best of 3)
  date: string;      // YYYY-MM-DD
  createdAt: number;
}

export interface BaselineRanking {
  name: string;
  type: 'singles' | 'doubles';
  played: number;
  wins: number;
  losses: number;
  points: number;    // wins * 2
}

export interface PlayerRatingEntry {
  name: string;
  rating: number;
  uncertainty: number;  // SD (RC) or RD (Glicko-2)
  volatility?: number;  // Glicko-2 σ only
  won: number;
  lost: number;
  gamesPlayed: number;
  algo: 'rc' | 'glicko2';
  type: 'singles' | 'doubles';
}

export interface TeamStats {
  team: Team;
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  setWins: number;     // for 'sets' format
  setLosses: number;
  gameWins: number;    // individual game wins
  gameLosses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  rank: number;
}
