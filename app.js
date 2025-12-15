/* =========================================================
   CBI TRIP PLANNER APP
   Firebase Auth + Firestore
   Teacher classes + Class roster + Student login auto-assign
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

// Teacher classes
let teacherClasses = [];
let unsubscribeClasses = null;

// Selected class for roster
let selectedClassId = null;
let selectedClassMeta = null;

// Roster realtime
let rosterList = [];
let unsubscribeRoster = null;

// Student profile
let studentProfile = null;

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

  let profileSnap = await getDoc(studentRef);
  let profile = profileSnap.exists() ? profileSnap.data() : null;

  if (profile?.teacherId && profile?.classId) return profile;

  const studentEmail = (user.email || "").toLowerCase().trim();
  if (!studentEmail) return profile;

  const rosterQ = query(
    collectionGroup(db, "roster"),
    where("email", "==", studentEmail),
    limit(1)
  );

  const rosterSnap = await getDocs(rosterQ);
  if (rosterSnap.empty) return profile;

  const rosterDoc = rosterSnap.docs[0];
  const parts = rosterDoc.ref.path.split("/");
  // teachers/{teacherId}/classes/{classId}/roster/{rosterId}
  const teacherId = parts[1];
  const classId = parts[3];

  await setDoc(
    studentRef,
    { teacherId, classId, assignedAt: serverTimestamp() },
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
    cleanupRosterRealtime();
    studentProfile = null;
    selectedClassId = null;
    selectedClassMeta = null;
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
   FIRESTORE: CLASS ROSTER
   Path: /teachers/{teacherUid}/classes/{classId}/roster/{rosterId}
   ========================================================= */

function cleanupRosterRealtime() {
  if (unsubscribeRoster) {
    unsubscribeRoster();
    unsubscribeRoster = null;
  }
  rosterList = [];
}

function startRosterRealtime(teacherUid, classId) {
  cleanupRosterRealtime();
  if (!teacherUid || !classId) return;

  const rosterRef = collection(db, "teachers", teacherUid, "classes", classId, "roster");
  const q = query(rosterRef, orderBy("createdAt", "desc"));

  unsubscribeRoster = onSnapshot(
    q,
    snapshot => {
      rosterList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "classRoster") renderClassRosterScreen();
    },
    err => {
      console.error(err);
      if (currentScreen === "classRoster") {
        setError("rosterError", err?.message || "Could not load roster. Check rules.");
      }
    }
  );
}

function openRosterForClass(classId) {
  if (!authUser) return goTo("teacherAuth");

  const found = teacherClasses.find(c => c.id === classId) || null;
  selectedClassId = classId;
  selectedClassMeta = found;

  startRosterRealtime(authUser.uid, classId);
  goTo("classRoster");
}

async function addStudentToRoster() {
  setError("rosterError", "");

  if (!authUser || !selectedClassId) {
    setError("rosterError", "No class selected.");
    return;
  }

  const emailRaw = ($("rosterEmail")?.value || "").trim();
  const nameRaw = ($("rosterName")?.value || "").trim();

  const email = emailRaw.toLowerCase();
  if (!email) {
    setError("rosterError", "Student email is required.");
    return;
  }
  if (!email.includes("@")) {
    setError("rosterError", "Enter a valid email address.");
    return;
  }

  try {
    const rosterRef = collection(db, "teachers", authUser.uid, "classes", selectedClassId, "roster");
    await addDoc(rosterRef, {
      email,
      name: nameRaw,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    if ($("rosterEmail")) $("rosterEmail").value = "";
    if ($("rosterName")) $("rosterName").value = "";
  } catch (err) {
    console.error(err);
    setError("rosterError", err?.message || "Could not add student.");
  }
}

async function removeStudentFromRoster(rosterId) {
  if (!authUser || !selectedClassId) return;

  const ok = confirm("Remove this student from the roster?");
  if (!ok) return;

  try {
    const ref = doc(db, "teachers", authUser.uid, "classes", selectedClassId, "roster", rosterId);
    await deleteDoc(ref);
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not remove student.");
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
  if (currentScreen === "classRoster") return renderClassRosterScreen();
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
                <button class="btn-primary" type="button" data-roster="${c.id}">Roster</button>
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
    </section>
  `);

  $("btnCreateClass")?.addEventListener("click", () => goTo("createClass"));
  $("btnSignOut")?.addEventListener("click", appSignOut);

  document.querySelectorAll("[data-roster]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-roster");
      if (id) openRosterForClass(id);
    });
  });

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

function renderClassRosterScreen() {
  if (!authUser) return goTo("teacherAuth");
  if (!selectedClassId) return goTo("teacherClasses");

  const classTitle = escapeHtml(selectedClassMeta?.name || "Class roster");
  const classYear = escapeHtml(selectedClassMeta?.schoolYear || "");
  const sub = classYear ? `<div class="small-note">School year: ${classYear}</div>` : "";

  const rosterHtml = rosterList.length
    ? rosterList
        .map(s => {
          const name = escapeHtml(s.name || "");
          const email = escapeHtml(s.email || "");
          const showName = name ? `<div><strong>${name}</strong></div>` : "";
          return `
            <div class="summary-card" style="margin-bottom:12px;">
              ${showName}
              <div class="small-note">${email}</div>
              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <button class="btn-secondary" type="button" data-remove="${s.id}">Remove</button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<p class="small-note">No students yet. Add student emails below.</p>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="rosterTitle">
      <h2 id="rosterTitle">${classTitle}</h2>
      ${sub}

      <div class="summary-card" style="margin-top:14px;">
        <h4 style="margin-top:0;">Add student</h4>

        <label for="rosterEmail">Student email (required)</label>
        <input id="rosterEmail" type="email" placeholder="Example: 123456@student.auhsd.us" autocomplete="off" />

        <label for="rosterName">Student name (optional)</label>
        <input id="rosterName" type="text" placeholder="Example: Beau K." autocomplete="off" />

        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
          <button class="btn-primary" type="button" id="btnAddStudent">Add to roster</button>
          <button class="btn-secondary" type="button" id="btnBackClasses">Back to classes</button>
        </div>

        <p id="rosterError" style="color:#b00020; margin-top:10px;"></p>

        <p class="small-note" style="margin-top:10px;">
          Students will auto-land in this class when they log in and their email matches a roster entry.
        </p>
      </div>

      <div style="margin-top:16px;">
        <h3 style="margin-bottom:10px;">Roster</h3>
        ${rosterHtml}
      </div>
    </section>
  `);

  $("btnAddStudent")?.addEventListener("click", addStudentToRoster);
  $("btnBackClasses")?.addEventListener("click", () => {
    cleanupRosterRealtime();
    selectedClassId = null;
    selectedClassMeta = null;
    goTo("teacherClasses");
  });

  document.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove");
      if (id) removeStudentFromRoster(id);
    });
  });
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
              <p class="small-note" style="margin-top:10px;">
                Next: we connect trip steps and save trips.
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

      if (screen === "teacherClasses" || screen === "createClass") {
        if (!authUser) return goTo("teacherAuth");
      }

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
    cleanupRosterRealtime();
    studentProfile = null;
    selectedClassId = null;
    selectedClassMeta = null;

    if (currentScreen !== "landing") goTo("landing");
    else render();

    return;
  }

  try {
    await ensureTeacherProfile(authUser);
    startTeacherClassesRealtime(authUser.uid);

    studentProfile = await ensureStudentProfileAndAutoAssign(authUser);

    if (currentScreen === "studentAuth") {
      goTo("studentHome");
      return;
    }

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
