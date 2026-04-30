import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBx1L1Ar0UJRxUb6c5Z_e3VSj5Ka23STUI",
  authDomain: "mhtt-tournament-a3e15.firebaseapp.com",
  projectId: "mhtt-tournament-a3e15",
  storageBucket: "mhtt-tournament-a3e15.firebasestorage.app",
  messagingSenderId: "103008649101",
  appId: "1:103008649101:web:35e724738e160a56b407c4",
  measurementId: "G-MMR8YNZ3TM"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
