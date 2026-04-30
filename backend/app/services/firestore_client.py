import firebase_admin
from firebase_admin import credentials, firestore as admin_firestore
import os
import json

_app = None


def get_firestore():
    global _app
    if _app is None:
        sa_json = os.getenv('SERVICE_ACCOUNT_JSON')
        if sa_json:
            cred = credentials.Certificate(json.loads(sa_json))
        else:
            cred = credentials.ApplicationDefault()
        _app = firebase_admin.initialize_app(cred)
    return admin_firestore.client()
