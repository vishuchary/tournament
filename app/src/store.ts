import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, query, orderBy, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Tournament, TournamentLevel, Group, Match, Player } from './types';
import type { PlayerRanking } from './rankings';

// Firestore stores arrays natively, but migrated RTDB data may have
// the object-with-numeric-keys shape. Keep toArray as a safeguard.
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

function sanitizeKey(name: string): string {
  return name.replace(/[.#$[\]/]/g, '_');
}

export function saveRankings(rankings: PlayerRanking[]): Promise<void> {
  const batch = writeBatch(db);
  rankings.forEach(r => {
    batch.set(doc(db, 'rankings', sanitizeKey(r.name)), r);
  });
  return batch.commit()
    .catch(err => console.error('Firestore save rankings failed:', err));
}

export function subscribeRankings(callback: (rankings: PlayerRanking[]) => void): () => void {
  const q = query(collection(db, 'rankings'), orderBy('points', 'desc'));
  return onSnapshot(q, snapshot => {
    const list = snapshot.docs.map(d => d.data() as PlayerRanking);
    callback(list);
  });
}
