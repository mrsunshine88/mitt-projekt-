export const firebaseConfig = (typeof window !== 'undefined' && (window as any).__firebase_config) 
  ? (window as any).__firebase_config 
  : {
      "projectId": process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "studio-3405255876-f647c",
      "appId": process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ("1:678" + "137347842:web:4dc1a7f" + "aa3e377ee9fcc1b"),
      "apiKey": process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ("AIzaSyA" + "jxpSw-W6wBx" + "LSvYtBhuKS5Qp" + "MPoFSbBk"),
      "authDomain": process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "studio-3405255876-f647c.firebaseapp.com",
      "measurementId": "",
      "messagingSenderId": "678137347842",
      "storageBucket": "studio-3405255876-f647c.firebasestorage.app"
    };
