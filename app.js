/* =========================================================
   CBI PLANNER APP LOGIC
   Standard JS, teacher and student friendly
   Firebase Auth + Firestore (Classes)
   ========================================================= */

/*
  IMPORTANT
  This file is written to work with Firebase "modular" SDK (v9+).
  Your index.html must load this file as a module:

    <script type="module" src="app.js"></script>

  If you are NOT using type="module", tell me and I will regenerate
  an older "compat" version.
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================================================
   FIREBASE CONFIG
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyAC-zl14hzA9itpol-0yhz4NYiSF-aSy4Q",
  authDomain: "cbi-planner-web.firebaseapp.com",
  projectId: "cbi-planner-web",
  storageBucket: "cbi-planner-web.firebasestorage.app",
  messagingSenderId: "736590365612",
  appId: "1:736590365612:web:043b8cb2bee5666c6ff009",
  measurementId: "G-NC838KKZNZ"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

/* =========================================================
   APP STATE
   ========================================================= */

let currentScreen = "landing"; // landing | teacherAuth | teacherClasses | createClass | home
let authUser = null;

// Teacher classes cached from Firestore realtime listener
let teacherClasses = [];
let unsubscribeClasses = null;

/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setAppHtml(html) {
  const appRoot = $("app");
  if (!appRoot) return;
  appRoot.innerHTML = html;
}

function setError(id, message) {
  const el = $(id);
  if (!el) return;
  el.textContent = message || "";
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function goTo(screenName) {
  currentScreen = screenName;
  render();
  highlightSidebar(screenName);
}

function highlightSidebar(screenName) {
  const items = document.querySelectorAll(".sidebar-item");
  items.forEach(btn => {
    const target = btn.getAttribute("data-screen");
    if (target === screenName) {
      btn.classList.add("active");
      btn.setAttribute("aria-current", "page");
    } else {
      btn.classList.remove("active");
      btn.removeAttribute("aria-current");
    }
  });
}

/* =========================================================
   AUTH
   ========================================================= */

async function ensureTeacherProfile(user) {
  if (!user) return;

  // Teachers are stored at /teachers/{uid}
  const teacherRef = doc(db, "teachers", user.uid);
  const snap = await getDoc(teacherRef);

  const payload = {
    email: user.email || "",
    name: user.displayName || "",
    updatedAt: serverTimestamp()
  };

  if (!snap.exists()) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(teacherRef, payload, { merge: true });
}

async function teacherSignInWithGoogle() {
  setError("teacherAuthError", "");
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // onAuthStateChanged will handle navigation
  } catch (err) {
    console.error(err);
    setError("teacherAuthError", err?.message || "Google sign-in failed.");
  }
}

async function teacherCreateAccountEmail() {
  setError("teacherAuthError", "");

  const email = ($("teacherEmail")?.value || "").trim();
  const pass = $("teacherPassword")?.value || "";
  const name = ($("teacherName")?.value || "").trim();

  if (!email || !pass) {
    setError("teacherAuthError", "Please enter an email and password.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (name) {
      await updateProfile(cred.user, { displayName: name });
    }
  } catch (err) {
    console.error(err);
    setError("teacherAuthError", err?.message || "Account creation failed.");
  }
}

async function teacherSignInEmail() {
  setError("teacherAuthError", "");

  const email = ($("teacherEmail")?.value || "").trim();
  const pass = $("teacherPassword")?.value || "";

  if (!email || !pass) {
    setError("teacherAuthError", "Please enter an email and password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    console.error(err);
    setError("teacherAuthError", err?.message || "Sign-in failed.");
  }
}

async function appSignOut() {
  try {
    await signOut(auth);
    cleanupTeacherRealtime();
    goTo("landing");
  } catch (err) {
    console.error(err);
    alert("Sign out failed. Try again.");
  }
}

/* =========================================================
   FIRESTORE: TEACHER CLASSES
   Path: /teachers/{teacherUid}/classes/{classId}
   ========================================================= */

function cleanupTeacherRealtime() {
  if (unsubscribeClasses) {
    unsubscribeClasses();
    unsubscribeClasses = null;
  }
  teacherClasses = [];
}

function startTeacherClassesRealtime(teacherUid) {
  cleanupTeacherRealtime();
  if (!teacherUid) return;

  const classesRef = collection(db, "teachers", teacherUid, "classes");
  const q = query(classesRef, orderBy("createdAt", "desc"));

  unsubscribeClasses = onSnapshot(
    q,
    snapshot => {
      teacherClasses = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      // Only re-render if we are on a screen that needs it
      if (currentScreen === "teacherClasses") {
        renderTeacherClassesScreen();
      }
    },
    err => {
      console.error(err);
      if (currentScreen === "teacherClasses") {
        setError(
          "classesError",
          err?.message || "Could not load classes. Check Firestore rules."
        );
      }
    }
  );
}

async function createClassFromForm() {
  setError("createClassError", "");

  if (!authUser) {
    setError("createClassError", "You must be signed in.");
    return;
  }

  const className = ($("className")?.value || "").trim();
  const schoolYear = ($("schoolYear")?.value || "").trim();

  if (!className) {
    setError("createClassError", "Class name is required.");
    return;
  }

  try {
    const classesRef = collection(db, "teachers", authUser.uid, "classes");
    await addDoc(classesRef, {
      name: className,
      schoolYear: schoolYear,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    goTo("teacherClasses");
  } catch (err) {
    console.error(err);
    setError(
      "createClassError",
      err?.message || "Could not create class. Check Firestore rules."
    );
  }
}

async function renameClass(classId) {
  if (!authUser) return;

  const found = teacherClasses.find(c => c.id === classId);
  const currentName = found?.name || "";
  const nextName = prompt("Rename class", currentName);

  if (nextName == null) return;

  const cleanName = nextName.trim();
  if (!cleanName) {
    alert("Class name cannot be blank.");
    return;
  }

  try {
    const classRef = doc(db, "teachers", authUser.uid, "classes", classId);
    await updateDoc(classRef, {
      name: cleanName,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not rename class.");
  }
}

async function deleteClass(classId) {
  if (!authUser) return;

  const ok = confirm(
    "Delete this class? This will remove the class document. If you later add students and trips under it, you will want a safer archive flow."
  );
  if (!ok) return;

  try {
    const classRef = doc(db, "teachers", authUser.uid, "classes", classId);
    await deleteDoc(classRef);
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not delete class.");
  }
}

/* =========================================================
   RENDER: SCREENS
   ========================================================= */

function render() {
  if (currentScreen === "landing") {
    renderLandingScreen();
    return;
  }

  if (currentScreen === "teacherAuth") {
    renderTeacherAuthScreen();
    return;
  }

  if (currentScreen === "teacherClasses") {
    renderTeacherClassesScreen();
    return;
  }

  if (currentScreen === "createClass") {
    renderCreateClassScreen();
    return;
  }

  // Default placeholder
  renderHomePlaceholder();
}

function renderLandingScreen() {
  setAppHtml(`
    <section class="screen" aria-labelledby="landingTitle">
      <h2 id="landingTitle">Welcome</h2>
      <p>Choose your mode.</p>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:16px;">
        <button class="btn-primary" type="button" id="btnTeacher">
          Teacher
        </button>

        <button class="btn-secondary" type="button" id="btnStudent">
          Student
        </button>
      </div>

      <p class="small-note" style="margin-top:14px;">
        Teacher mode lets you create classes and rosters. Student mode will come next.
      </p>
    </section>
  `);

  $("btnTeacher")?.addEventListener("click", () => goTo("teacherAuth"));
  $("btnStudent")?.addEventListener("click", () => {
    alert("Student login and profiles are next. We will add them after classes are working.");
  });

  // Sidebar highlight fallback
  highlightSidebar("home");
}

function renderTeacherAuthScreen() {
  const signedIn = !!authUser;

  setAppHtml(`
    <section class="screen" aria-labelledby="teacherAuthTitle">
      <h2 id="teacherAuthTitle">Teacher login</h2>

      ${
        signedIn
          ? `
            <p>You are signed in as:</p>
            <div class="summary-card" style="margin-top:10px;">
              <div class="summary-row">
                <span class="summary-label">Name:</span>
                <span class="summary-value">${escapeHtml(authUser.displayName || "-")}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Email:</span>
                <span class="summary-value">${escapeHtml(authUser.email || "-")}</span>
              </div>
            </div>

            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
              <button class="btn-primary" type="button" id="btnGoClasses">
                Go to teacher classes
              </button>
              <button class="btn-secondary" type="button" id="btnSignOut">
                Sign out
              </button>
            </div>
          `
          : `
            <p>Sign in with your school email.</p>

            <div class="summary-card" style="margin-top:14px;">
              <h4 style="margin-top:0;">Google sign-in</h4>
              <button class="btn-primary" type="button" id="btnGoogle">
                Sign in with Google
              </button>
              <p class="small-note" style="margin-top:10px;">
                If your district blocks popups, allow popups for this site.
              </p>
            </div>

            <div class="summary-card" style="margin-top:14px;">
              <h4 style="margin-top:0;">Email and password</h4>

              <label for="teacherName">Name (for new accounts)</label>
              <input id="teacherName" type="text" autocomplete="name" placeholder="Example: Ryan Keating" />

              <label for="teacherEmail">Email</label>
              <input id="teacherEmail" type="email" autocomplete="email" placeholder="Example: lastname_f@auhsd.us" />

              <label for="teacherPassword">Password</label>
              <input id="teacherPassword" type="password" autocomplete="current-password" placeholder="Password" />

              <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px;">
                <button class="btn-primary" type="button" id="btnEmailSignIn">
                  Sign in
                </button>
                <button class="btn-secondary" type="button" id="btnEmailCreate">
                  Create account
                </button>
              </div>

              <p id="teacherAuthError" style="color:#b00020; margin-top:10px;"></p>
            </div>
          `
      }

      <button class="btn-secondary" type="button" style="margin-top:16px;" id="btnBackLanding">
        Back
      </button>
    </section>
  `);

  $("btnBackLanding")?.addEventListener("click", () => goTo("landing"));

  if (signedIn) {
    $("btnGoClasses")?.addEventListener("click", () => goTo("teacherClasses"));
    $("btnSignOut")?.addEventListener("click", appSignOut);
  } else {
    $("btnGoogle")?.addEventListener("click", teacherSignInWithGoogle);
    $("btnEmailSignIn")?.addEventListener("click", teacherSignInEmail);
    $("btnEmailCreate")?.addEventListener("click", teacherCreateAccountEmail);
  }
}

function renderTeacherClassesScreen() {
  if (!authUser) {
    setAppHtml(`
      <section class="screen" aria-labelledby="classesTitle">
        <h2 id="classesTitle">Teacher classes</h2>
        <p>You must sign in first.</p>
        <button class="btn-primary" type="button" id="btnGoLogin">Go to teacher login</button>
      </section>
    `);
    $("btnGoLogin")?.addEventListener("click", () => goTo("teacherAuth"));
    return;
  }

  const listHtml = teacherClasses.length
    ? teacherClasses
        .map(c => {
          const name = escapeHtml(c.name || "Untitled class");
          const year = escapeHtml(c.schoolYear || "");
          const sub = year ? `<div class="small-note">School year: ${year}</div>` : "";
          return `
            <article class="summary-card" style="margin-bottom:12px;">
              <h4 style="margin-top:0; margin-bottom:6px;">${name}</h4>
              ${sub}
              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <button class="btn-secondary" type="button" data-rename="${c.id}">
                  Rename
                </button>
                <button class="btn-secondary" type="button" data-delete="${c.id}">
                  Delete
                </button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<p class="small-note">No classes yet. Create one to get started.</p>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="classesTitle">
      <h2 id="classesTitle">Teacher classes</h2>
      <p>Create and manage your classes.</p>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px;">
        <button class="btn-primary" type="button" id="btnCreateClass">
          Create class
        </button>
        <button class="btn-secondary" type="button" id="btnSignOut">
          Sign out
        </button>
      </div>

      <p id="classesError" style="color:#b00020; margin-top:10px;"></p>

      <div style="margin-top:16px;">
        ${listHtml}
      </div>
    </section>
  `);

  $("btnCreateClass")?.addEventListener("click", () => goTo("createClass"));
  $("btnSignOut")?.addEventListener("click", appSignOut);

  // Wire rename/delete buttons
  document.querySelectorAll("[data-rename]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-rename");
      if (id) renameClass(id);
    });
  });

  document.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete");
      if (id) deleteClass(id);
    });
  });
}

function renderCreateClassScreen() {
  if (!authUser) {
    goTo("teacherAuth");
    return;
  }

  setAppHtml(`
    <section class="screen" aria-labelledby="createClassTitle">
      <h2 id="createClassTitle">Create class</h2>

      <label for="className">Class name</label>
      <input
        id="className"
        type="text"
        placeholder="Example: Keating ATP"
        autocomplete="off"
      />

      <label for="schoolYear">School year</label>
      <input
        id="schoolYear"
        type="text"
        placeholder="Example: 2025-2026"
        autocomplete="off"
      />

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <button class="btn-primary" type="button" id="btnSaveClass">
          Create class
        </button>
        <button class="btn-secondary" type="button" id="btnCancelClass">
          Cancel
        </button>
      </div>

      <p id="createClassError" style="color:#b00020; margin-top:10px;"></p>
    </section>
  `);

  $("btnSaveClass")?.addEventListener("click", createClassFromForm);
  $("btnCancelClass")?.addEventListener("click", () => goTo("teacherClasses"));
}

function renderHomePlaceholder() {
  setAppHtml(`
    <section class="screen" aria-labelledby="homeTitle">
      <h2 id="homeTitle">Home</h2>
      <p>Home screen placeholder. Teacher classes is now connected to Firestore.</p>

      <button class="btn-primary" type="button" id="btnGoTeacher">
        Go to teacher login
      </button>
    </section>
  `);

  $("btnGoTeacher")?.addEventListener("click", () => goTo("teacherAuth"));
}

/* =========================================================
   SIDEBAR WIRING
   ========================================================= */

function wireSidebar() {
  const sidebarItems = document.querySelectorAll(".sidebar-item");

  sidebarItems.forEach(item => {
    const screen = item.getAttribute("data-screen");

    item.addEventListener("click", () => {
      if (!screen) return;

      // Protect teacher screens
      if (screen === "teacherClasses" || screen === "createClass") {
        if (!authUser) {
          goTo("teacherAuth");
          return;
        }
      }

      goTo(screen);
    });

    item.addEventListener("mousemove", event => {
      const rect = item.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      item.style.setProperty("--x", `${x}px`);
      item.style.setProperty("--y", `${y}px`);
    });
  });
}

/* =========================================================
   AUTH STATE LISTENER
   ========================================================= */

onAuthStateChanged(auth, async user => {
  authUser = user || null;

  if (authUser) {
    try {
      await ensureTeacherProfile(authUser);
      startTeacherClassesRealtime(authUser.uid);

      // If you are on landing or teacherAuth, push into classes
      if (currentScreen === "landing" || currentScreen === "teacherAuth") {
        goTo("teacherClasses");
        return;
      }
    } catch (err) {
      console.error(err);
      // Stay on current screen, but show a safe fallback
      if (currentScreen !== "teacherAuth") {
        goTo("teacherAuth");
      }
    }
  } else {
    cleanupTeacherRealtime();

    // If user logs out while in teacher screens, send them back
    if (currentScreen === "teacherClasses" || currentScreen === "createClass") {
      goTo("landing");
      return;
    }
  }

  render();
});

/* =========================================================
   INITIALIZE APP
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  // First paint
  render();

  // Sidebar buttons
  wireSidebar();

  // Highlight a reasonable default
  highlightSidebar("home");
});
