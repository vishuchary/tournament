import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Replace these values with your Firebase project config
// Get them from: https://console.firebase.google.com → Project Settings → Your apps
const firebaseConfig = {
  apiKey: "AIzaSyCCM3KJgBVXNLt3cS17nnshMN2X2DENDQI",
  authDomain: "tt-scoring-60039.firebaseapp.com",
  databaseURL: "https://tt-scoring-60039-default-rtdb.firebaseio.com",
  projectId: "tt-scoring-60039",
  storageBucket: "tt-scoring-60039.firebasestorage.app",
  messagingSenderId: "1004560876496",
  appId: "1:1004560876496:web:43df450d12522ac7b7efd5"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);


