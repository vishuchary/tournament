import firebase_admin
from firebase_admin import credentials, firestore
import json

# Initialize Firebase
cred = credentials.Certificate("service-account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

def backup_collection(collection_name):
    docs = db.collection(collection_name).stream()
    data = {doc.id: doc.to_dict() for doc in docs}
    
    with open(f"{collection_name}_base_050126_v1.json", "w") as f:
        json.dump(data, f, indent=4)
    print(f"Success: {collection_name} exported.")

# List your collections here
collections = ['players', 'ratings', 'tournaments']

for col in collections:
    backup_collection(col)
