import firebase_admin
from firebase_admin import credentials, firestore
import json
import os

# Initialize using Application Default Credentials (ADC)
# This removes the need for the service-account.json file
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {
        'projectId': 'mhtt-tournament-a3e15',
    })

db = firestore.client()

def backup_collection(collection_name):
    try:
        docs = db.collection(collection_name).stream()
        data = {doc.id: doc.to_dict() for doc in docs}
        
        filename = f"{collection_name}_base_050126_v1.json"
        with open(filename, "w") as f:
            json.dump(data, f, indent=4)
        print(f"Success: {collection_name} exported to {filename}")
    except Exception as e:
        print(f"Error exporting {collection_name}: {e}")

# List your collections
collections = ['players', 'ratings', 'tournaments']

for col in collections:
    backup_collection(col)