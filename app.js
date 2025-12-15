/* =========================================================
   CBI TRIP PLANNER APP
   Firebase Auth + Firestore
   Teacher classes + Student login + Auto profile + Auto class assignment
   ========================================================= */

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
  orderBy,
  collectionGroup,
  where,
  limit,
  getDocs
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

let currentScreen = "landing";
let authUser = null;

let teacherClasses = [];
let unsubscribeClasses = null;

let studentProfile = null; // /students/{uid}

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
   AUTH: TEACHER
   ========================================================= */

async function ensureTeacherProfile(user) {
  if (!user) return;

  const teacherRef = doc(db, "teachers", user.uid);
  const snap = await getDoc(teacherRef);

  const payload = {
    email: user.email || "",
    name: user.displayName || "",
    updatedAt: serverTimestamp()
  };

  if (!snap.exists()) payload.createdAt = serverTimestamp();

  await setDoc(teacherRef, payload, { merge: true });
}

async function teacherSignInWithGoogle() {
  setError("teacherAuthError", "");
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
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
    if (name) await updateProfile(cred.user, { displayName: name });
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

/* =========================================================
   AUTH: STUDENT
   ========================================================= */

async function studentSignInWithGoogle() {
  setError("studentAuthError", "");
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    setError("studentAuthError", err?.message || "Google sign-in failed.");
  }
}

async function ensureStudentProfileAndAutoAssign(user) {
  if (!user) return null;

  const studentRef = doc(db, "students", user.uid);
  const snap = await getDoc(studentRef);

  const base = {
    email: user.email || "",
    name: user.displayName || "",
    updatedAt: serverTimestamp()
  };

  if (!snap.exists()) {
    await setDoc(studentRef, { ...base, createdAt: serverTimestamp() }, { merge: true });
  } else {
    await setDoc(studentRef, base, { merge: true });
  }

  // Re-read so we have the newest data
  let profileSnap = await getDoc(studentRef);
  let profile = profileSnap.exists() ? profileSnap.data() : null;

  // If already assigned, done
  if (profile?.teacherId && profile?.classId) return profile;

  // Auto-assign by finding roster doc that matches the student's email
  // Roster path: /teachers/{teacherId}/classes/{classId}/roster/{rosterId}
  // Roster doc must include: { email: "student@email" }
  const studentEmail = (user.email || "").toLowerCase().trim();
  if (!studentEmail) return profile;

  const rosterQ = query(
    collectionGroup(db, "roster"),
    where("email", "==", studentEmail),
    limit(1)
  );

  const rosterSnap = await getDocs(rosterQ);
  if (rosterSnap.empty) {
    // Not found yet. Teacher needs to add the student to a class roster first.
    return profile;
  }

  const rosterDoc = rosterSnap.docs[0];
  const rosterPath = rosterDoc.ref.path;

  // Parse teacherId and classId from the path:
  // teachers/{teacherId}/classes/{classId}/roster/{rosterId}
  const parts = rosterPath.split("/");
  const teacherId = parts[1];
  const classId = parts[3];

  await setDoc(
    studentRef,
    {
      teacherId,
      classId,
      assignedAt: serverTimestamp()
    },
    { merge: true }
  );

  profileSnap = await getDoc(studentRef);
  profile = profileSnap.exists() ? profileSnap.data() : profile;

  return profile;
}

/* =========================================================
   SIGN OUT
   ========================================================= */

async function appSignOut() {
  try {
    await signOut(auth);
    cleanupTeacherRealtime();
    studentProfile = null;
    goTo("landing");
  } catch (err) {
    console.error(err);
    alert("Sign out failed. Try again.");
  }
}

/* =========================================================
   FIRESTORE: TEACHER CLASSES
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
      teacherClasses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "teacherClasses") renderTeacherClassesScreen();
    },
    err => {
      console.error(err);
      if (currentScreen === "teacherClasses") {
        setError("classesError", err?.message || "Could not load classes. Check Firestore rules.");
      }
    }
  );
}

async function createClassFromForm() {
  setError("createClassError", "");
  if (!authUser) return;

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
      schoolYear,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    goTo("teacherClasses");
  } catch (err) {
    console.error(err);
    setError("createClassError", err?.message || "Could not create class.");
  }
}

async function renameClass(classId) {
  if (!authUser) return;

  const found = teacherClasses.find(c => c.id === classId);
  const currentName = found?.name || "";
  const nextName = prompt("Rename class", currentName);
  if (nextName == null) return;

  const cleanName = nextName.trim();
  if (!cleanName) return;

  try {
    const classRef = doc(db, "teachers", authUser.uid, "classes", classId);
    await updateDoc(classRef, { name: cleanName, updatedAt: serverTimestamp() });
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not rename class.");
  }
}

async function deleteClass(classId) {
  if (!authUser) return;

  const ok = confirm("Delete this class?");
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
   RENDER
   ========================================================= */

function render() {
  if (currentScreen === "landing") return renderLandingScreen();
  if (currentScreen === "teacherAuth") return renderTeacherAuthScreen();
  if (currentScreen === "teacherClasses") return renderTeacherClassesScreen();
  if (currentScreen === "createClass") return renderCreateClassScreen();
  if (currentScreen === "studentAuth") return renderStudentAuthScreen();
  if (currentScreen === "studentHome") return renderStudentHomeScreen();

  return renderLandingScreen();
}

function renderLandingScreen() {
  setAppHtml(`
    <section class="screen" aria-labelledby="landingTitle">
      <h2 id="landingTitle">Welcome</h2>
      <p>Choose your mode.</p>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:16px;">
        <button class="btn-primary" type="button" id="btnTeacher">Teacher</button>
        <button class="btn-secondary" type="button" id="btnStudent">Student</button>
      </div>

      <p class="small-note" style="margin-top:14px;">
        Students should sign in with their school Google account.
      </p>
    </section>
  `);

  $("btnTeacher")?.addEventListener("click", () => goTo("teacherAuth"));
  $("btnStudent")?.addEventListener("click", () => goTo("studentAuth"));

  highlightSidebar("landing");
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
              <button class="btn-primary" type="button" id="btnGoClasses">Go to teacher classes</button>
              <button class="btn-secondary" type="button" id="btnSignOut">Sign out</button>
            </div>
          `
          : `
            <p>Sign in with your school account.</p>

            <div class="summary-card" style="margin-top:14px;">
              <h4 style="margin-top:0;">Google sign-in</h4>
              <button class="btn-primary" type="button" id="btnGoogleTeacher">Sign in with Google</button>
              <p class="small-note" style="margin-top:10px;">If popups are blocked, allow popups for this site.</p>
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
                <button class="btn-primary" type="button" id="btnEmailTeacherSignIn">Sign in</button>
                <button class="btn-secondary" type="button" id="btnEmailTeacherCreate">Create account</button>
              </div>

              <p id="teacherAuthError" style="color:#b00020; margin-top:10px;"></p>
            </div>
          `
      }

      <button class="btn-secondary" type="button" style="margin-top:16px;" id="btnBackLanding">Back</button>
    </section>
  `);

  $("btnBackLanding")?.addEventListener("click", () => goTo("landing"));

  if (signedIn) {
    $("btnGoClasses")?.addEventListener("click", () => goTo("teacherClasses"));
    $("btnSignOut")?.addEventListener("click", appSignOut);
  } else {
    $("btnGoogleTeacher")?.addEventListener("click", teacherSignInWithGoogle);
    $("btnEmailTeacherSignIn")?.addEventListener("click", teacherSignInEmail);
    $("btnEmailTeacherCreate")?.addEventListener("click", teacherCreateAccountEmail);
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
                <button class="btn-secondary" type="button" data-rename="${c.id}">Rename</button>
                <button class="btn-secondary" type="button" data-delete="${c.id}">Delete</button>
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
        <button class="btn-primary" type="button" id="btnCreateClass">Create class</button>
        <button class="btn-secondary" type="button" id="btnSignOut">Sign out</button>
      </div>

      <p id="classesError" style="color:#b00020; margin-top:10px;"></p>

      <div style="margin-top:16px;">${listHtml}</div>

      <div class="summary-card" style="margin-top:16px;">
        <h4 style="margin-top:0;">Student auto assignment tip</h4>
        <p class="small-note">
          Students will be auto-assigned when their email exists in a class roster.
          Next step after this is adding a roster screen for each class.
        </p>
      </div>
    </section>
  `);

  $("btnCreateClass")?.addEventListener("click", () => goTo("createClass"));
  $("btnSignOut")?.addEventListener("click", appSignOut);

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
  if (!authUser) return goTo("teacherAuth");

  setAppHtml(`
    <section class="screen" aria-labelledby="createClassTitle">
      <h2 id="createClassTitle">Create class</h2>

      <label for="className">Class name</label>
      <input id="className" type="text" placeholder="Example: Keating ATP" autocomplete="off" />

      <label for="schoolYear">School year</label>
      <input id="schoolYear" type="text" placeholder="Example: 2025-2026" autocomplete="off" />

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <button class="btn-primary" type="button" id="btnSaveClass">Create class</button>
        <button class="btn-secondary" type="button" id="btnCancelClass">Cancel</button>
      </div>

      <p id="createClassError" style="color:#b00020; margin-top:10px;"></p>
    </section>
  `);

  $("btnSaveClass")?.addEventListener("click", createClassFromForm);
  $("btnCancelClass")?.addEventListener("click", () => goTo("teacherClasses"));
}

function renderStudentAuthScreen() {
  const signedIn = !!authUser;

  setAppHtml(`
    <section class="screen" aria-labelledby="studentAuthTitle">
      <h2 id="studentAuthTitle">Student login</h2>

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
              <button class="btn-primary" type="button" id="btnGoStudentHome">Go to student home</button>
              <button class="btn-secondary" type="button" id="btnSignOut">Sign out</button>
            </div>
          `
          : `
            <p>Sign in with your school Google account.</p>

            <div class="summary-card" style="margin-top:14px;">
              <button class="btn-primary" type="button" id="btnGoogleStudent">Sign in with Google</button>
              <p id="studentAuthError" style="color:#b00020; margin-top:10px;"></p>
            </div>
          `
      }

      <button class="btn-secondary" type="button" style="margin-top:16px;" id="btnBackLanding">Back</button>
    </section>
  `);

  $("btnBackLanding")?.addEventListener("click", () => goTo("landing"));

  if (signedIn) {
    $("btnGoStudentHome")?.addEventListener("click", () => goTo("studentHome"));
    $("btnSignOut")?.addEventListener("click", appSignOut);
  } else {
    $("btnGoogleStudent")?.addEventListener("click", studentSignInWithGoogle);
  }
}

function renderStudentHomeScreen() {
  if (!authUser) return goTo("studentAuth");

  const assigned = !!(studentProfile?.teacherId && studentProfile?.classId);

  setAppHtml(`
    <section class="screen" aria-labelledby="studentHomeTitle">
      <h2 id="studentHomeTitle">Student home</h2>

      ${
        assigned
          ? `
            <div class="summary-card" style="margin-top:12px;">
              <h4 style="margin-top:0;">You are assigned</h4>
              <div class="summary-row">
                <span class="summary-label">Class ID:</span>
                <span class="summary-value">${escapeHtml(studentProfile.classId)}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Teacher ID:</span>
                <span class="summary-value">${escapeHtml(studentProfile.teacherId)}</span>
              </div>
              <p class="small-note" style="margin-top:10px;">
                Next upgrade will show the class name and your saved trips.
              </p>
            </div>
          `
          : `
            <div class="summary-card" style="margin-top:12px;">
              <h4 style="margin-top:0;">Not assigned yet</h4>
              <p class="small-note">
                Your teacher needs to add your school email to the class roster first.
              </p>
              <p class="small-note">
                Signed in as: <strong>${escapeHtml(authUser.email || "")}</strong>
              </p>
            </div>
          `
      }

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <button class="btn-secondary" type="button" id="btnSignOut">Sign out</button>
      </div>
    </section>
  `);

  $("btnSignOut")?.addEventListener("click", appSignOut);
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
        if (!authUser) return goTo("teacherAuth");
      }

      // Protect student home
      if (screen === "studentHome") {
        if (!authUser) return goTo("studentAuth");
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
   AUTH STATE
   ========================================================= */

onAuthStateChanged(auth, async user => {
  authUser = user || null;

  if (!authUser) {
    cleanupTeacherRealtime();
    studentProfile = null;

    if (currentScreen !== "landing") goTo("landing");
    else render();

    return;
  }

  // If signed in, keep teacher classes realtime available
  // and also build student profile if the user goes to student screens.
  try {
    // Teacher profile is safe to upsert even if user is a student,
    // but if you prefer, we can add domain checking later.
    await ensureTeacherProfile(authUser);
    startTeacherClassesRealtime(authUser.uid);

    // Always ensure student profile too, because students will sign in themselves.
    studentProfile = await ensureStudentProfileAndAutoAssign(authUser);

    // If they just signed in from student login, send them to student home.
    if (currentScreen === "studentAuth") {
      goTo("studentHome");
      return;
    }

    // If they just signed in from teacher login, send them to teacher classes.
    if (currentScreen === "teacherAuth" || currentScreen === "landing") {
      goTo("teacherClasses");
      return;
    }
  } catch (err) {
    console.error(err);
  }

  render();
});

/* =========================================================
   INIT
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  render();
  wireSidebar();
  highlightSidebar("landing");
});
