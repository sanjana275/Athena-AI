// Firebase Web App SDK Configuration
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBgG-No-czsHaT8lEVYaOpwbACh4MdCg2s",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "athena-ai-27a17.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "athena-ai-27a17",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "athena-ai-27a17.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "287383121997",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:287383121997:web:4b1c85c8782cb73c876c04",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-WH0TLM3R78"
};
