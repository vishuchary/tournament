import firebase_admin
from firebase_admin import credentials, firestore as admin_firestore
import os
import json


def _init_firebase():
    sa_json = os.getenv('SERVICE_ACCOUNT_JSON')
    if sa_json:
        cred = credentials.Certificate(json.loads(sa_json))
    else:
        cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)


try:
    firebase_admin.get_app()
except ValueError:
    _init_firebase()


def get_firestore():
    return admin_firestore.client()
