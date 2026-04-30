import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD85kJXIBij0RmDAszBhvZWRjA-Zg8mISQ",
  authDomain: "mhtt-tournament.firebaseapp.com",
  projectId: "mhtt-tournament",
  storageBucket: "mhtt-tournament.firebasestorage.app",
  messagingSenderId: "779994883668",
  appId: "1:779994883668:web:8359e0ded0ce19ea29efc1",
  measurementId: "G-CHFEVD3N3P"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
