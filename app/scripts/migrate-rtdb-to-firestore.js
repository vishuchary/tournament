#!/usr/bin/env node
// Migrates data from Firebase Realtime Database → Firestore
// Run once: node app/scripts/migrate-rtdb-to-firestore.js
//
// Requires: GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON
// Download from: Firebase Console → Project Settings → Service Accounts → Generate new private key

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON || '{}');

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: 'https://mhtt-tournament-default-rtdb.firebaseio.com',
});

const rtdb = getDatabase();
const firestore = getFirestore();

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
    return {
      ...raw,
      levels: [{
        id: raw.id + '_l1',
        name: 'Level 1',
        groups: toArray(raw.groups).map(normalizeGroup),
      }],
    };
  }
  return {
    ...raw,
    levels: toArray(raw.levels).map(level => ({
      ...level,
      groups: toArray(level.groups).map(normalizeGroup),
    })),
  };
}

function sanitizeKey(name) {
  return name.replace(/[.#$[\]/]/g, '_');
}

async function migrate() {
  console.log('Reading from Realtime Database...');
  const snapshot = await rtdb.ref('/').once('value');
  const data = snapshot.val();

  if (!data) {
    console.log('No data found in Realtime Database. Nothing to migrate.');
    return;
  }

  const batch_size = 400; // Firestore batch limit is 500

  // Migrate tournaments
  const tournaments = data.tournaments ? Object.values(data.tournaments) : [];
  console.log(`Migrating ${tournaments.length} tournaments...`);
  for (let i = 0; i < tournaments.length; i += batch_size) {
    const batch = firestore.batch();
    tournaments.slice(i, i + batch_size).forEach(raw => {
      const t = normalizeTournament(raw);
      batch.set(firestore.collection('tournaments').doc(t.id), t);
    });
    await batch.commit();
  }
  console.log(`✓ ${tournaments.length} tournaments migrated`);

  // Migrate players
  const players = data.players ? Object.values(data.players) : [];
  console.log(`Migrating ${players.length} players...`);
  for (let i = 0; i < players.length; i += batch_size) {
    const batch = firestore.batch();
    players.slice(i, i + batch_size).forEach(p => {
      batch.set(firestore.collection('players').doc(p.id), p);
    });
    await batch.commit();
  }
  console.log(`✓ ${players.length} players migrated`);

  // Migrate rankings
  const rankings = data.rankings ? Object.values(data.rankings) : [];
  console.log(`Migrating ${rankings.length} ranking entries...`);
  for (let i = 0; i < rankings.length; i += batch_size) {
    const batch = firestore.batch();
    rankings.slice(i, i + batch_size).forEach(r => {
      batch.set(firestore.collection('rankings').doc(sanitizeKey(r.name)), r);
    });
    await batch.commit();
  }
  console.log(`✓ ${rankings.length} ranking entries migrated`);

  console.log('\nMigration complete! Verify data in Firebase Console → Firestore.');
  console.log('Once verified, you can disable the Realtime Database.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
