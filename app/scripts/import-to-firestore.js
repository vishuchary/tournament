#!/usr/bin/env node
// Imports exported RTDB JSON into Firestore (mhtt-tournament-a3e15)
// Usage: node app/scripts/import-to-firestore.js

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, 'import-export.json'), 'utf8'));

initializeApp({ credential: applicationDefault(), projectId: 'mhtt-tournament-a3e15' });
const db = getFirestore();

const BATCH_SIZE = 400;

async function importCollection(collectionName, records, idFn) {
  const items = Object.values(records);
  console.log(`Importing ${items.length} ${collectionName}...`);
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = db.batch();
    items.slice(i, i + BATCH_SIZE).forEach(item => {
      batch.set(db.collection(collectionName).doc(idFn(item)), item);
    });
    await batch.commit();
  }
  console.log(`✓ ${items.length} ${collectionName} imported`);
}

async function run() {
  if (data.players)    await importCollection('players',     data.players,     p => p.id);
  if (data.rankings)   await importCollection('rankings',    data.rankings,    r => r.name.replace(/[.#$[\]/]/g, '_'));
  if (data.tournaments) await importCollection('tournaments', data.tournaments, t => t.id);
  console.log('\nDone! Check Firestore console to verify.');
}

run().catch(err => { console.error(err); process.exit(1); });
