import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ================= FIREBASE CONFIG ================= */

const firebaseConfig = {
  apiKey: "AIzaSyAC-zl14hzA9itpol-0yhz4NYiSF-aSy4Q",
  authDomain: "cbi-planner-web.firebaseapp.com",
  projectId: "cbi-planner-web",
  storageBucket: "cbi-planner-web.firebasestorage.app",
  messagingSenderId: "736590365612",
  appId: "1:736590365612:web:043b8cb2bee5666c6ff009"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ================= APP STATE ================= */

let currentScreen = "landing";
let authUser = null;

/* ================= HELPERS ================= */

const root = document.getElementById("app");

function goTo(screen) {
  currentScreen = screen;
  render();
  highlightSidebar();
}

function highlightSidebar() {
  document.querySelectorAll(".sidebar-item").forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.screen === currentScreen
    );
  });
}

/* ================= AUTH ================= */

async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

async function logout() {
  await signOut(auth);
  goTo("landing");
}

async function ensureTeacherDoc(user) {
  const ref = doc(db, "teachers", user.uid);
  await setDoc(ref, {
    email: user.email,
    name: user.displayName || "",
    updatedAt: serverTimestamp()
  }, { merge: true });
}

/* ================= RENDER ================= */

function render() {
  if (currentScreen === "landing") {
    root.innerHTML = `
      <section class="screen">
        <h2>Welcome</h2>
        <p>Select your role.</p>

        <button class="btn-primary" onclick="goTo('teacherAuth')">
          Teacher
        </button>
      </section>
    `;
  }

  if (currentScreen === "teacherAuth") {
    root.innerHTML = `
      <section class="screen">
        <h2>Teacher login</h2>

        <div class="summary-card">
          <button class="google-btn" id="googleSignIn">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" />
            Sign in with Google
          </button>
        </div>

        <p class="small-note">
          Use your school Google account.
        </p>
      </section>
    `;

    document
      .getElementById("googleSignIn")
      .addEventListener("click", signInWithGoogle);
  }

  if (currentScreen === "teacherClasses") {
    root.innerHTML = `
      <section class="screen">
        <h2>Your classes</h2>

        <button class="btn-secondary" onclick="logout()">
          Sign out
        </button>

        <p class="small-note">
          Class management is connected to Firestore.
        </p>
      </section>
    `;
  }
}

/* ================= AUTH LISTENER ================= */

onAuthStateChanged(auth, async user => {
  authUser = user;

  if (user) {
    await ensureTeacherDoc(user);
    goTo("teacherClasses");
  } else {
    goTo("landing");
  }
});

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", () => {
  render();

  document.querySelectorAll(".sidebar-item").forEach(btn => {
    btn.addEventListener("click", () => {
      goTo(btn.dataset.screen);
    });
  });
});
