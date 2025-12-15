/* =========================================================
   CBI TRIP PLANNER
   Firebase Auth + Firestore
   Teacher login + Teacher classes + Class roster (assign students)
   Student login + Auto profile creation + Auto class assignment
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
  getDocs,
  collection,
  collectionGroup,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit
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

let activeRole = "none"; // "teacher" | "student" | "none"
let studentProfile = null;

// Teacher classes
let teacherClasses = [];
let unsubscribeClasses = null;

// Roster
let selectedClassId = null;
let selectedClassName = null;
let roster = [];
let unsubscribeRoster = null;

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
   ROLE INTENT (Landing choice)
   ========================================================= */

const ROLE_KEY = "cbi_role_intent";

function setRoleIntent(role) {
  localStorage.setItem(ROLE_KEY, role);
}

function getRoleIntent() {
  const v = localStorage.getItem(ROLE_KEY);
  if (v === "teacher" || v === "student") return v;
  return "teacher";
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
   AUTH HELPERS
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

/*
  Student auto assignment logic:

  Teacher adds roster invite doc at:
  /teachers/{teacherUid}/classes/{classId}/roster/{rosterDocId}

  Example fields:
  {
    studentEmail,
    studentName,
    status: "invited",
    teacherId,
    classId,
    createdAt
  }

  When a student logs in, we:
  1) Create /students/{uid} if missing
  2) If studentProfile.classId is empty, search for a roster invite matching studentEmail
  3) If found, set student profile teacherId + classId + status "active"
     and mark roster entry as "claimed" + store studentUid
*/

async function tryClaimRosterInviteForStudent(user) {
  if (!user?.email) return null;

  // Find one invite anywhere (collectionGroup lets us search all roster subcollections)
  const q = query(
    collectionGroup(db, "roster"),
    where("studentEmail", "==", user.email),
    where("status", "==", "invited"),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const inviteDoc = snap.docs[0];
  const inviteData = inviteDoc.data();

  const teacherId = inviteData.teacherId || null;
  const classId = inviteData.classId || null;

  if (!teacherId || !classId) return null;

  // Update the roster doc to claimed
  await updateDoc(inviteDoc.ref, {
    status: "claimed",
    studentUid: user.uid,
    claimedAt: serverTimestamp()
  });

  // Update student profile
  const studentRef = doc(db, "students", user.uid);
  await setDoc(
    studentRef,
    {
      teacherId,
      classId,
      status: "active",
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return { teacherId, classId };
}

async function ensureStudentProfile(user) {
  if (!user) return null;

  const studentRef = doc(db, "students", user.uid);
  const snap = await getDoc(studentRef);

  const payload = {
    email: user.email || "",
    name: user.displayName || "",
    updatedAt: serverTimestamp()
  };

  if (!snap.exists()) {
    payload.createdAt = serverTimestamp();
    payload.teacherId = null;
    payload.classId = null;
    payload.status = "pending";
  }

  await setDoc(studentRef, payload, { merge: true });

  // Re-read fresh data
  let fresh = await getDoc(studentRef);
  let data = fresh.exists() ? { id: fresh.id, ...fresh.data() } : null;

  // If not assigned yet, try to auto-claim invite
  if (data && !data.classId && user.email) {
    const claimed = await tryClaimRosterInviteForStudent(user);
    if (claimed) {
      fresh = await getDoc(studentRef);
      data = fresh.exists() ? { id: fresh.id, ...fresh.data() } : data;
    }
  }

  return data;
}

async function appSignOut() {
  try {
    await signOut(auth);
    cleanupTeacherRealtime();
    cleanupRosterRealtime();
    studentProfile = null;
    activeRole = "none";
    selectedClassId = null;
    selectedClassName = null;
    goTo("landing");
  } catch (err) {
    console.error(err);
    alert("Sign out failed. Try again.");
  }
}

/* =========================================================
   TEACHER AUTH ACTIONS
   ========================================================= */

async function teacherSignInWithGoogle() {
  setError("teacherAuthError", "");
  try {
    setRoleIntent("teacher");
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    setError("teacherAuthError", err?.message || "Google sign-in failed.");
  }
}

async function teacherCreateAccountEmail() {
  setError("teacherAuthError", "");
  setRoleIntent("teacher");

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
  setRoleIntent("teacher");

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
   STUDENT AUTH ACTIONS
   ========================================================= */

async function studentSignInWithGoogle() {
  setError("studentAuthError", "");
  try {
    setRoleIntent("student");
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    setError("studentAuthError", err?.message || "Google sign-in failed.");
  }
}

async function studentCreateAccountEmail() {
  setError("studentAuthError", "");
  setRoleIntent("student");

  const email = ($("studentEmail")?.value || "").trim();
  const pass = $("studentPassword")?.value || "";
  const name = ($("studentName")?.value || "").trim();

  if (!email || !pass) {
    setError("studentAuthError", "Please enter an email and password.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (name) await updateProfile(cred.user, { displayName: name });
  } catch (err) {
    console.error(err);
    setError("studentAuthError", err?.message || "Account creation failed.");
  }
}

async function studentSignInEmail() {
  setError("studentAuthError", "");
  setRoleIntent("student");

  const email = ($("studentEmail")?.value || "").trim();
  const pass = $("studentPassword")?.value || "";

  if (!email || !pass) {
    setError("studentAuthError", "Please enter an email and password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    console.error(err);
    setError("studentAuthError", err?.message || "Sign-in failed.");
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
      teacherClasses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "teacherClasses") renderTeacherClassesScreen();
    },
    err => {
      console.error(err);
      if (currentScreen === "teacherClasses") {
        setError("classesError", err?.message || "Could not load classes.");
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
  if (!cleanName) {
    alert("Class name cannot be blank.");
    return;
  }

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
   FIRESTORE: CLASS ROSTER (assign students)
   Path: /teachers/{teacherUid}/classes/{classId}/roster/{rosterDoc}
   ========================================================= */

function cleanupRosterRealtime() {
  if (unsubscribeRoster) {
    unsubscribeRoster();
    unsubscribeRoster = null;
  }
  roster = [];
}

function startRosterRealtime(teacherUid, classId) {
  cleanupRosterRealtime();
  if (!teacherUid || !classId) return;

  const rosterRef = collection(db, "teachers", teacherUid, "classes", classId, "roster");
  const q = query(rosterRef, orderBy("createdAt", "desc"));

  unsubscribeRoster = onSnapshot(
    q,
    snapshot => {
      roster = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "classRoster") renderClassRosterScreen();
    },
    err => {
      console.error(err);
      if (currentScreen === "classRoster") {
        setError("rosterError", err?.message || "Could not load roster.");
      }
    }
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function addStudentToRoster() {
  setError("rosterError", "");

  if (!authUser || activeRole !== "teacher") {
    setError("rosterError", "You must be signed in as a teacher.");
    return;
  }
  if (!selectedClassId) {
    setError("rosterError", "No class selected.");
    return;
  }

  const studentName = ($("studentRosterName")?.value || "").trim();
  const studentEmail = ($("studentRosterEmail")?.value || "").trim().toLowerCase();

  if (!studentEmail || !isValidEmail(studentEmail)) {
    setError("rosterError", "Enter a valid student email.");
    return;
  }

  try {
    const rosterRef = collection(db, "teachers", authUser.uid, "classes", selectedClassId, "roster");
    await addDoc(rosterRef, {
      studentName: studentName || "",
      studentEmail,
      status: "invited",
      teacherId: authUser.uid,
      classId: selectedClassId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Clear inputs
    if ($("studentRosterName")) $("studentRosterName").value = "";
    if ($("studentRosterEmail")) $("studentRosterEmail").value = "";
  } catch (err) {
    console.error(err);
    setError("rosterError", err?.message || "Could not add student.");
  }
}

async function removeRosterEntry(rosterId) {
  if (!authUser || activeRole !== "teacher") return;
  if (!selectedClassId) return;

  const ok = confirm("Remove this student from the roster?");
  if (!ok) return;

  try {
    const rosterDocRef = doc(db, "teachers", authUser.uid, "classes", selectedClassId, "roster", rosterId);
    await deleteDoc(rosterDocRef);
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not remove roster entry.");
  }
}

/* =========================================================
   RENDER: SCREENS
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

      <p class="small-note" style="margin-top:14px;">
        Teachers invite students by email inside a class roster.
        Students log in and are automatically placed into their class.
      </p>
    </section>
  `);

  $("btnTeacher")?.addEventListener("click", () => {
    setRoleIntent("teacher");
    goTo("teacherAuth");
  });

  $("btnStudent")?.addEventListener("click", () => {
    setRoleIntent("student");
    goTo("studentAuth");
  });

  highlightSidebar("landing");
}

function renderTeacherAuthScreen() {
  const signedIn = !!authUser && activeRole === "teacher";

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
            <p>Sign in with your school email.</p>

            <div class="summary-card" style="margin-top:14px;">
              <h4 style="margin-top:0;">Google sign-in</h4>
              <button class="btn-primary" type="button" id="btnGoogle">Sign in with Google</button>
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
                <button class="btn-primary" type="button" id="btnEmailSignIn">Sign in</button>
                <button class="btn-secondary" type="button" id="btnEmailCreate">Create account</button>
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
    $("btnGoogle")?.addEventListener("click", teacherSignInWithGoogle);
    $("btnEmailSignIn")?.addEventListener("click", teacherSignInEmail);
    $("btnEmailCreate")?.addEventListener("click", teacherCreateAccountEmail);
  }
}

function renderTeacherClassesScreen() {
  if (!authUser || activeRole !== "teacher") {
    setAppHtml(`
      <section class="screen" aria-labelledby="classesTitle">
        <h2 id="classesTitle">Teacher classes</h2>
        <p>You must sign in as a teacher first.</p>
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
                <button class="btn-primary" type="button" data-roster="${c.id}" data-classname="${escapeHtml(c.name || "")}">
                  Roster
                </button>
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

      <div style="margin-top:16px;">
        ${listHtml}
      </div>
    </section>
  `);

  $("btnCreateClass")?.addEventListener("click", () => goTo("createClass"));
  $("btnSignOut")?.addEventListener("click", appSignOut);

  // Roster
  document.querySelectorAll("[data-roster]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-roster");
      const cname = btn.getAttribute("data-classname");
      selectedClassId = id;
      selectedClassName = cname || "Class roster";
      startRosterRealtime(authUser.uid, selectedClassId);
      goTo("classRoster");
    });
  });

  // Rename/delete
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
  if (!authUser || activeRole !== "teacher") {
    goTo("teacherAuth");
    return;
  }

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
  if (!authUser || activeRole !== "teacher") {
    goTo("teacherAuth");
    return;
  }
  if (!selectedClassId) {
    goTo("teacherClasses");
    return;
  }

  const listHtml = roster.length
    ? roster
        .map(r => {
          const nm = escapeHtml(r.studentName || "");
          const em = escapeHtml(r.studentEmail || "");
          const st = escapeHtml(r.status || "invited");
          const meta = nm ? `${nm} (${em})` : em;
          return `
            <article class="summary-card" style="margin-bottom:12px;">
              <h4 style="margin:0;">${meta}</h4>
              <div class="small-note" style="margin-top:6px;">Status: ${st}</div>
              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <button class="btn-secondary" type="button" data-remove-roster="${r.id}">Remove</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<p class="small-note">No students yet. Add students by email.</p>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="rosterTitle">
      <h2 id="rosterTitle">Class roster</h2>
      <p class="small-note">Class: ${escapeHtml(selectedClassName || "")}</p>

      <div class="summary-card" style="margin-top:14px;">
        <h4 style="margin-top:0;">Add student</h4>

        <label for="studentRosterName">Student name (optional)</label>
        <input id="studentRosterName" type="text" placeholder="Example: Alex" autocomplete="off" />

        <label for="studentRosterEmail">Student email</label>
        <input id="studentRosterEmail" type="email" placeholder="Example: 123456@student.auhsd.us" autocomplete="off" />

        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
          <button class="btn-primary" type="button" id="btnAddStudent">Add to roster</button>
          <button class="btn-secondary" type="button" id="btnBackToClasses">Back to classes</button>
        </div>

        <p id="rosterError" style="color:#b00020; margin-top:10px;"></p>

        <p class="small-note" style="margin-top:10px;">
          After you add a student, they just log in with that same email.
          Their account will automatically attach to this class.
        </p>
      </div>

      <div style="margin-top:16px;">
        ${listHtml}
      </div>
    </section>
  `);

  $("btnAddStudent")?.addEventListener("click", addStudentToRoster);
  $("btnBackToClasses")?.addEventListener("click", () => {
    cleanupRosterRealtime();
    selectedClassId = null;
    selectedClassName = null;
    goTo("teacherClasses");
  });

  document.querySelectorAll("[data-remove-roster]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-roster");
      if (id) removeRosterEntry(id);
    });
  });
}

function renderStudentAuthScreen() {
  const signedIn = !!authUser && activeRole === "student";

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
            <p>Sign in with your school email.</p>

            <div class="summary-card" style="margin-top:14px;">
              <h4 style="margin-top:0;">Google sign-in</h4>
              <button class="btn-primary" type="button" id="btnStudentGoogle">Sign in with Google</button>
              <p class="small-note" style="margin-top:10px;">If popups are blocked, allow popups for this site.</p>
            </div>

            <div class="summary-card" style="margin-top:14px;">
              <h4 style="margin-top:0;">Email and password</h4>

              <label for="studentName">Name (for new accounts)</label>
              <input id="studentName" type="text" autocomplete="name" placeholder="Your name" />

              <label for="studentEmail">Email</label>
              <input id="studentEmail" type="email" autocomplete="email" placeholder="Example: 123456@student.auhsd.us" />

              <label for="studentPassword">Password</label>
              <input id="studentPassword" type="password" autocomplete="current-password" placeholder="Password" />

              <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px;">
                <button class="btn-primary" type="button" id="btnStudentEmailSignIn">Sign in</button>
                <button class="btn-secondary" type="button" id="btnStudentEmailCreate">Create account</button>
              </div>

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
    $("btnStudentGoogle")?.addEventListener("click", studentSignInWithGoogle);
    $("btnStudentEmailSignIn")?.addEventListener("click", studentSignInEmail);
    $("btnStudentEmailCreate")?.addEventListener("click", studentCreateAccountEmail);
  }
}

function renderStudentHomeScreen() {
  if (!authUser || activeRole !== "student") {
    setAppHtml(`
      <section class="screen" aria-labelledby="studentHomeTitle">
        <h2 id="studentHomeTitle">Student home</h2>
        <p>You must sign in as a student first.</p>
        <button class="btn-primary" type="button" id="btnGoStudentLogin">Go to student login</button>
      </section>
    `);
    $("btnGoStudentLogin")?.addEventListener("click", () => goTo("studentAuth"));
    return;
  }

  const status = studentProfile?.status || "pending";
  const classId = studentProfile?.classId || null;

  const assignmentMessage =
    status === "active" && classId
      ? `<p class="small-note">You are assigned to a class. You are ready for trip saving next.</p>`
      : `<p class="small-note">Your profile is created. Your teacher still needs to add your email to a class roster.</p>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="studentHomeTitle">
      <h2 id="studentHomeTitle">Student home</h2>

      <div class="summary-card" style="margin-top:10px;">
        <div class="summary-row">
          <span class="summary-label">Name:</span>
          <span class="summary-value">${escapeHtml(authUser.displayName || "-")}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Email:</span>
          <span class="summary-value">${escapeHtml(authUser.email || "-")}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Status:</span>
          <span class="summary-value">${escapeHtml(status)}</span>
        </div>
      </div>

      <div style="margin-top:14px;">${assignmentMessage}</div>

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
        if (!authUser || activeRole !== "teacher") {
          setRoleIntent("teacher");
          goTo("teacherAuth");
          return;
        }
      }

      if (screen === "studentHome") {
        if (!authUser || activeRole !== "student") {
          setRoleIntent("student");
          goTo("studentAuth");
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

  if (!authUser) {
    cleanupTeacherRealtime();
    cleanupRosterRealtime();
    studentProfile = null;
    activeRole = "none";
    selectedClassId = null;
    selectedClassName = null;

    if (currentScreen === "teacherClasses" || currentScreen === "createClass" || currentScreen === "classRoster") {
      goTo("landing");
      return;
    }
    if (currentScreen === "studentHome") {
      goTo("landing");
      return;
    }

    render();
    return;
  }

  const intended = getRoleIntent();

  try {
    if (intended === "teacher") {
      activeRole = "teacher";
      studentProfile = null;

      await ensureTeacherProfile(authUser);
      startTeacherClassesRealtime(authUser.uid);

      if (currentScreen === "landing" || currentScreen === "teacherAuth") {
        goTo("teacherClasses");
        return;
      }
    } else {
      activeRole = "student";
      cleanupTeacherRealtime();
      cleanupRosterRealtime();
      selectedClassId = null;
      selectedClassName = null;

      studentProfile = await ensureStudentProfile(authUser);

      if (currentScreen === "landing" || currentScreen === "studentAuth") {
        goTo("studentHome");
        return;
      }
    }
  } catch (err) {
    console.error(err);
    activeRole = "none";
    studentProfile = null;
    cleanupTeacherRealtime();
    cleanupRosterRealtime();
    goTo("landing");
    return;
  }

  render();
});

/* =========================================================
   INITIALIZE APP
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  render();
  wireSidebar();
  highlightSidebar("landing");
});
