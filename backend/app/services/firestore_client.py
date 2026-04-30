import firebase_admin
from firebase_admin import credentials, firestore as admin_firestore
import os

_app = None


def get_firestore():
    global _app
    if _app is None:
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            cred = credentials.ApplicationDefault()
        else:
            cred = credentials.ApplicationDefault()
        _app = firebase_admin.initialize_app(cred)
    return admin_firestore.client()
