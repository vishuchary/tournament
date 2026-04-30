#!/usr/bin/env python3
import json, os, re, sys
import firebase_admin
from firebase_admin import credentials, firestore

DATA_FILE = os.path.join(os.path.dirname(__file__), '../app/scripts/import-export.json')

def init():
    sa_json = os.getenv('SERVICE_ACCOUNT_JSON')
    if sa_json:
        cred = credentials.Certificate(json.loads(sa_json))
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app(options={'projectId': 'mhtt-tournament-a3e15'})
    return firestore.client()

def safe_id(name):
    return re.sub(r'[.#$\[\]/]', '_', name)

def import_collection(db, collection, records, id_fn):
    items = list(records.values())
    print(f'Importing {len(items)} {collection}...')
    batch = db.batch()
    count = 0
    for item in items:
        batch.set(db.collection(collection).document(id_fn(item)), item)
        count += 1
        if count % 400 == 0:
            batch.commit()
            batch = db.batch()
    if count % 400 != 0:
        batch.commit()
    print(f'✓ {len(items)} {collection} imported')

def main():
    with open(DATA_FILE) as f:
        data = json.load(f)
    db = init()
    if 'players' in data:
        import_collection(db, 'players', data['players'], lambda p: p['id'])
    if 'rankings' in data:
        import_collection(db, 'rankings', data['rankings'], lambda r: safe_id(r['name']))
    if 'tournaments' in data:
        import_collection(db, 'tournaments', data['tournaments'], lambda t: t['id'])
    print('\nDone! Verify in Firestore console.')

main()
