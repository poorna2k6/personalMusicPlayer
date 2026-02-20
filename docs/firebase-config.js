// docs/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD8Zrnd7RWJEtUzLWZoGYkwASe2WDaDqU4", // As found in index.html
    authDomain: "raaga-29c3d.firebaseapp.com",
    projectId: "raaga-29c3d",
    storageBucket: "raaga-29c3d.firebasestorage.app",
    messagingSenderId: "428156117346",
    appId: "1:428156117346:web:80ee22529fa0f649670c3b"
};

let app, auth, db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Enable offline persistence for Firestore
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("Multiple tabs open, Firestore persistence can only be enabled in one tab at a a time.");
        } else if (err.code == 'unimplemented') {
            console.warn("The current browser does not support all of the features required to enable Firestore persistence.");
        }
    });

    const provider = new GoogleAuthProvider();

    window.raagamFirebase = {
        auth,
        db,
        signIn: () => signInWithPopup(auth, provider),
        signOut: () => signOut(auth),
        saveProfile: async (uid, data) => {
            try {
                await setDoc(doc(db, "users", uid), data, { merge: true });
                return true;
            } catch (e) {
                console.error("Error saving profile:", e);
                return false;
            }
        },
        getProfile: async (uid) => {
            try {
                const docSnap = await getDoc(doc(db, "users", uid));
                return docSnap.exists() ? docSnap.data() : null;
            } catch (e) {
                console.error("Error getting profile:", e);
                return null;
            }
        }
    };

    onAuthStateChanged(auth, (user) => {
        window.dispatchEvent(new CustomEvent('raagam:auth-changed', { detail: { user } }));
    });

    console.log("Firebase & Firestore Offline Persistence initialized successfully");
} catch (e) {
    console.error("Firebase initialization failed:", e);
}
