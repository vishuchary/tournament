import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Replace these values with your Firebase project config
// Get them from: https://console.firebase.google.com → Project Settings → Your apps
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD85kJXIBij0RmDAszBhvZWRjA-Zg8mISQ",
  authDomain: "mhtt-tournament.firebaseapp.com",
  databaseURL: "https://mhtt-tournament-default-rtdb.firebaseio.com",
  projectId: "mhtt-tournament",
  storageBucket: "mhtt-tournament.firebasestorage.app",
  messagingSenderId: "779994883668",
  appId: "1:779994883668:web:8359e0ded0ce19ea29efc1",
  measurementId: "G-CHFEVD3N3P"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);


