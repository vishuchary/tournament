import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Tournament, TournamentLevel, Group, Match, Player, PlayerRatingEntry, CompetitiveMatch } from './types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'https://backend-five-gules-97.vercel.app';

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

function toArray<T>(val: unknown): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val as T[];
  return Object.values(val as object) as T[];
}

function normalizeGroup(g: any): Group {
  return {
    ...g,
    teams: toArray(g.teams).map((t: any) => ({
      ...t,
      players: toArray<string>(t.players),
    })),
    matches: toArray<Match>(g.matches).map((m: any) => ({
      ...m,
      games: toArray(m.games),
    })),
  };
}

function normalizeTournament(raw: any): Tournament {
  if (raw.groups && !raw.levels) {
    return {
      id: raw.id,
      name: raw.name,
      format: raw.format,
      matchType: raw.matchType,
      createdAt: raw.createdAt,
      levels: [{
        id: raw.id + '_l1',
        name: 'Level 1',
        groups: toArray<Group>(raw.groups).map(normalizeGroup),
      }],
    };
  }
  return {
    ...raw,
    levels: toArray<TournamentLevel>(raw.levels).map((level: any) => ({
      ...level,
      groups: toArray<Group>(level.groups).map(normalizeGroup),
    })),
  };
}

// ---------------------------------------------------------------------------
// Backend API calls (admin-only)
// ---------------------------------------------------------------------------

export async function triggerBaselineRatingsRecompute(token: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${BACKEND_URL}/baseline/ratings/recompute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Backend error ${res.status}: ${text}`);
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Recompute timed out (>45s) — backend may be overloaded');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

export function subscribeTournaments(callback: (tournaments: Tournament[]) => void): () => void {
  const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snapshot => {
    const list = snapshot.docs.map(d => normalizeTournament({ id: d.id, ...d.data() }));
    callback(list);
  });
}

export function saveTournament(t: Tournament): Promise<void> {
  return setDoc(doc(db, 'tournaments', t.id), t)
    .catch(err => console.error('Firestore save failed:', err));
}

export function deleteTournament(id: string): Promise<void> {
  return deleteDoc(doc(db, 'tournaments', id))
    .catch(err => console.error('Firestore delete failed:', err));
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export function subscribePlayers(callback: (players: Player[]) => void): () => void {
  const q = query(collection(db, 'players'), orderBy('name'));
  return onSnapshot(q, snapshot => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Player));
    callback(list);
  });
}

export function savePlayer(p: Player): Promise<void> {
  return setDoc(doc(db, 'players', p.id), p)
    .catch(err => console.error('Firestore save player failed:', err));
}

export function deletePlayer(id: string): Promise<void> {
  return deleteDoc(doc(db, 'players', id))
    .catch(err => console.error('Firestore delete player failed:', err));
}

// ---------------------------------------------------------------------------
// Competitive matches
// ---------------------------------------------------------------------------

export function subscribeCompetitiveMatches(callback: (matches: CompetitiveMatch[]) => void): () => void {
  const q = query(collection(db, 'competitive_matches'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CompetitiveMatch)));
  });
}

export function saveCompetitiveMatch(m: CompetitiveMatch): Promise<void> {
  return setDoc(doc(db, 'competitive_matches', m.id), m)
    .catch(err => console.error('Firestore save competitive match failed:', err));
}

export function deleteCompetitiveMatch(id: string): Promise<void> {
  return deleteDoc(doc(db, 'competitive_matches', id))
    .catch(err => console.error('Firestore delete competitive match failed:', err));
}

// ---------------------------------------------------------------------------
// Baseline ratings (written by backend Python, read here)
// ---------------------------------------------------------------------------

export function subscribeBaselineRatings(
  callback: (ratings: PlayerRatingEntry[]) => void,
): () => void {
  return onSnapshot(collection(db, 'baseline_ratings'), snapshot => {
    callback(snapshot.docs.map(d => d.data() as PlayerRatingEntry));
  });
}

// ---------------------------------------------------------------------------
// Algorithm setting — admin writes, all read
// ---------------------------------------------------------------------------

export type RatingAlgo = 'rc' | 'glicko2';

export function subscribeAlgoSetting(callback: (algo: RatingAlgo) => void): () => void {
  return onSnapshot(doc(db, 'settings', 'baseline_algo'), snap => {
    const data = snap.data();
    callback((data?.algo as RatingAlgo) ?? 'rc');
  });
}

export function saveAlgoSetting(algo: RatingAlgo): Promise<void> {
  return setDoc(doc(db, 'settings', 'baseline_algo'), { algo })
    .catch(err => console.error('Firestore save algo setting failed:', err));
}
