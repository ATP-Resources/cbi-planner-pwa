/* =========================================================
   CBI PLANNER PLATFORM
   Teacher + Student login
   Teacher creates classes + roster
   Student joins class via code once, then auto lands in class
   Firebase v9+ modular (via CDN module imports)
========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
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

let currentScreen = "landing";
let authUser = null;

// Role and context
let role = "none"; // none | teacher | student
let activeClass = null; // { teacherUid, classId, name, schoolYear, joinCode }

// Realtime caches
let teacherClasses = [];
let classRoster = [];
let classStudents = [];

let unsubTeacherClasses = null;
let unsubRoster = null;
let unsubStudents = null;

/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setAppHtml(html) {
  const root = $("app");
  if (!root) return;
  root.innerHTML = html;
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

function setError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
}

/* =========================================================
   NAV
========================================================= */

function goTo(screen) {
  currentScreen = screen;
  render();
  highlightSidebar(screen);
}

function highlightSidebar(screenName) {
  document.querySelectorAll(".sidebar-item").forEach(btn => {
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

function wireSidebar() {
  document.querySelectorAll(".sidebar-item").forEach(btn => {
    const screen = btn.getAttribute("data-screen");
    btn.addEventListener("click", () => {
      if (!screen) return;

      // Teacher protected screens
      if (screen === "teacherClasses" || screen === "classDetail") {
        if (!authUser) {
          goTo("teacherAuth");
          return;
        }
        if (role !== "teacher") {
          goTo("landing");
          return;
        }
      }

      // Student protected screens
      if (screen === "studentHome") {
        if (!authUser) {
          goTo("studentAuth");
          return;
        }
        if (role !== "student") {
          goTo("landing");
          return;
        }
      }

      goTo(screen);
    });
  });
}

/* =========================================================
   AUTH ACTIONS
========================================================= */

async function signInGoogleTeacher() {
  setError("authErr", "");
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // role detection runs after auth
  } catch (err) {
    console.error(err);
    setError("authErr", err?.message || "Google sign in failed.");
  }
}

async function signInGoogleStudent() {
  setError("studentAuthErr", "");
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // role detection runs after auth
  } catch (err) {
    console.error(err);
    setError("studentAuthErr", err?.message || "Google sign in failed.");
  }
}

async function appSignOut() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
    alert("Sign out failed. Try again.");
  }
}

/* =========================================================
   ROLE DETECTION
   Teacher if /teachers/{uid} exists
   Student if /students/{uid} exists
========================================================= */

async function detectRoleForUser(user) {
  if (!user) return "none";

  const teacherRef = doc(db, "teachers", user.uid);
  const teacherSnap = await getDoc(teacherRef);
  if (teacherSnap.exists()) return "teacher";

  const studentRef = doc(db, "students", user.uid);
  const studentSnap = await getDoc(studentRef);
  if (studentSnap.exists()) return "student";

  return "none";
}

/* =========================================================
   TEACHER DATA
========================================================= */

function cleanupTeacherRealtime() {
  if (unsubTeacherClasses) unsubTeacherClasses();
  if (unsubRoster) unsubRoster();
  if (unsubStudents) unsubStudents();

  unsubTeacherClasses = null;
  unsubRoster = null;
  unsubStudents = null;

  teacherClasses = [];
  classRoster = [];
  classStudents = [];
}

async function ensureTeacherProfile(user) {
  const teacherRef = doc(db, "teachers", user.uid);
  await setDoc(
    teacherRef,
    {
      email: user.email || "",
      name: user.displayName || "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
}

function startTeacherClassesRealtime(teacherUid) {
  if (unsubTeacherClasses) unsubTeacherClasses();

  const ref = collection(db, "teachers", teacherUid, "classes");
  const q = query(ref, orderBy("createdAt", "desc"));

  unsubTeacherClasses = onSnapshot(
    q,
    snap => {
      teacherClasses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "teacherClasses") renderTeacherClassesScreen();
    },
    err => {
      console.error(err);
      if (currentScreen === "teacherClasses") {
        setError("classesErr", err?.message || "Could not load classes.");
      }
    }
  );
}

function startClassDetailRealtime(teacherUid, classId) {
  if (unsubRoster) unsubRoster();
  if (unsubStudents) unsubStudents();

  classRoster = [];
  classStudents = [];

  const rosterRef = collection(db, "teachers", teacherUid, "classes", classId, "roster");
  const studentsRef = collection(db, "teachers", teacherUid, "classes", classId, "students");

  unsubRoster = onSnapshot(
    query(rosterRef, orderBy("createdAt", "desc")),
    snap => {
      classRoster = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "classDetail") renderClassDetailScreen();
    }
  );

  unsubStudents = onSnapshot(
    query(studentsRef, orderBy("joinedAt", "desc")),
    snap => {
      classStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "classDetail") renderClassDetailScreen();
    }
  );
}

function makeJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function createClass() {
  setError("createClassErr", "");

  const name = ($("className")?.value || "").trim();
  const year = ($("schoolYear")?.value || "").trim();

  if (!name) {
    setError("createClassErr", "Class name is required.");
    return;
  }

  const joinCode = makeJoinCode();

  try {
    const classesRef = collection(db, "teachers", authUser.uid, "classes");
    const newClass = await addDoc(classesRef, {
      name,
      schoolYear: year,
      joinCode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Save code lookup doc for students to join
    const codeRef = doc(db, "classCodes", joinCode);
    await setDoc(codeRef, {
      teacherUid: authUser.uid,
      classId: newClass.id,
      className: name,
      schoolYear: year,
      joinCode,
      createdAt: serverTimestamp()
    });

    goTo("teacherClasses");
  } catch (err) {
    console.error(err);
    setError("createClassErr", err?.message || "Could not create class.");
  }
}

async function openClass(classId) {
  const found = teacherClasses.find(c => c.id === classId);
  if (!found) return;

  activeClass = {
    teacherUid: authUser.uid,
    classId,
    name: found.name || "",
    schoolYear: found.schoolYear || "",
    joinCode: found.joinCode || ""
  };

  startClassDetailRealtime(authUser.uid, classId);
  goTo("classDetail");
}

async function deleteClass(classId) {
  const ok = confirm("Delete this class?");
  if (!ok) return;

  const found = teacherClasses.find(c => c.id === classId);
  const joinCode = found?.joinCode || "";

  try {
    await deleteDoc(doc(db, "teachers", authUser.uid, "classes", classId));
    if (joinCode) {
      await deleteDoc(doc(db, "classCodes", joinCode));
    }
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not delete class.");
  }
}

async function addRosterStudent() {
  setError("rosterErr", "");

  if (!activeClass) return;

  const email = ($("rosterEmail")?.value || "").trim().toLowerCase();
  if (!email) {
    setError("rosterErr", "Enter a student email.");
    return;
  }

  try {
    const rosterRef = collection(
      db,
      "teachers",
      activeClass.teacherUid,
      "classes",
      activeClass.classId,
      "roster"
    );

    await addDoc(rosterRef, {
      email,
      createdAt: serverTimestamp()
    });

    $("rosterEmail").value = "";
  } catch (err) {
    console.error(err);
    setError("rosterErr", err?.message || "Could not add roster student.");
  }
}

async function removeRosterStudent(rosterId) {
  if (!activeClass) return;
  try {
    await deleteDoc(
      doc(
        db,
        "teachers",
        activeClass.teacherUid,
        "classes",
        activeClass.classId,
        "roster",
        rosterId
      )
    );
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not remove roster student.");
  }
}

/* =========================================================
   STUDENT DATA
========================================================= */

async function ensureStudentProfile(user) {
  const studentRef = doc(db, "students", user.uid);
  await setDoc(
    studentRef,
    {
      email: user.email || "",
      name: user.displayName || "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
}

async function joinClassWithCode() {
  setError("joinErr", "");

  const code = ($("joinCode")?.value || "").trim().toUpperCase();
  if (!code) {
    setError("joinErr", "Enter the class code.");
    return;
  }

  try {
    const codeRef = doc(db, "classCodes", code);
    const snap = await getDoc(codeRef);

    if (!snap.exists()) {
      setError("joinErr", "That class code was not found. Check the code and try again.");
      return;
    }

    const data = snap.data();
    const teacherUid = data.teacherUid;
    const classId = data.classId;

    // Save student membership profile so next login auto lands
    const studentRef = doc(db, "students", authUser.uid);
    await setDoc(
      studentRef,
      {
        email: authUser.email || "",
        name: authUser.displayName || "",
        role: "student",
        classTeacherUid: teacherUid,
        classId: classId,
        joinCode: code,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      },
      { merge: true }
    );

    // Also write under the teacher class for teacher visibility
    const membershipRef = doc(db, "teachers", teacherUid, "classes", classId, "students", authUser.uid);
    await setDoc(
      membershipRef,
      {
        studentUid: authUser.uid,
        email: authUser.email || "",
        name: authUser.displayName || "",
        joinCode: code,
        joinedAt: serverTimestamp()
      },
      { merge: true }
    );

    goTo("studentHome");
  } catch (err) {
    console.error(err);
    setError("joinErr", err?.message || "Could not join class. Try again.");
  }
}

async function loadStudentClassContext() {
  if (!authUser) return null;

  const studentRef = doc(db, "students", authUser.uid);
  const snap = await getDoc(studentRef);
  if (!snap.exists()) return null;

  const s = snap.data();
  if (!s.classTeacherUid || !s.classId) return null;

  const classRef = doc(db, "teachers", s.classTeacherUid, "classes", s.classId);
  const classSnap = await getDoc(classRef);
  if (!classSnap.exists()) return null;

  const c = classSnap.data();
  return {
    teacherUid: s.classTeacherUid,
    classId: s.classId,
    name: c.name || "",
    schoolYear: c.schoolYear || "",
    joinCode: c.joinCode || ""
  };
}

/* =========================================================
   RENDER
========================================================= */

function render() {
  if (currentScreen === "landing") return renderLanding();
  if (currentScreen === "teacherAuth") return renderTeacherAuth();
  if (currentScreen === "teacherClasses") return renderTeacherClassesScreen();
  if (currentScreen === "classDetail") return renderClassDetailScreen();
  if (currentScreen === "studentAuth") return renderStudentAuth();
  if (currentScreen === "studentHome") return renderStudentHome();

  renderLanding();
}

function renderLanding() {
  setAppHtml(`
    <section class="screen" aria-labelledby="t">
      <h2 id="t">Welcome</h2>
      <p>Choose your role.</p>

      <div class="row" style="margin-top:12px;">
        <button class="btn-primary btn-inline" type="button" id="goTeacher">
          Teacher
        </button>
        <button class="btn-secondary btn-inline" type="button" id="goStudent">
          Student
        </button>
      </div>

      <div class="card" style="margin-top:14px;">
        <p class="small-note" style="margin:0;">
          Teachers create classes and rosters. Students log in and join a class with a code one time.
        </p>
      </div>
    </section>
  `);

  $("goTeacher")?.addEventListener("click", () => goTo("teacherAuth"));
  $("goStudent")?.addEventListener("click", () => goTo("studentAuth"));
}

function renderTeacherAuth() {
  const signedIn = !!authUser;

  setAppHtml(`
    <section class="screen" aria-labelledby="ta">
      <h2 id="ta">Teacher login</h2>

      ${
        signedIn && role === "teacher"
          ? `
            <div class="card">
              <p><strong>Signed in:</strong> ${escapeHtml(authUser.email || "")}</p>
              <div class="actions">
                <button class="btn-primary btn-inline" type="button" id="goClasses">
                  Go to classes
                </button>
                <button class="btn-secondary btn-inline" type="button" id="doSignOut">
                  Sign out
                </button>
              </div>
            </div>
          `
          : `
            <p>Use Google sign in with your school account.</p>

            <button class="google-btn" type="button" id="teacherGoogle">
              <img alt="" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" />
              Sign in with Google
            </button>

            <p id="authErr" class="error"></p>

            <div class="card" style="margin-top:14px;">
              <p class="small-note" style="margin:0;">
                After sign in, you will automatically go to Teacher Classes.
              </p>
            </div>
          `
      }

      <button class="btn-secondary" type="button" id="backLanding">
        Back
      </button>
    </section>
  `);

  $("backLanding")?.addEventListener("click", () => goTo("landing"));

  if (signedIn && role === "teacher") {
    $("goClasses")?.addEventListener("click", () => goTo("teacherClasses"));
    $("doSignOut")?.addEventListener("click", appSignOut);
  } else {
    $("teacherGoogle")?.addEventListener("click", async () => {
      await signInGoogleTeacher();
      if (auth.currentUser) {
        await ensureTeacherProfile(auth.currentUser);
      }
    });
  }
}

function renderTeacherClassesScreen() {
  if (!authUser || role !== "teacher") {
    setAppHtml(`
      <section class="screen">
        <h2>Teacher classes</h2>
        <p>You must sign in as a teacher.</p>
        <button class="btn-primary" type="button" id="toTeacherLogin">Go to teacher login</button>
      </section>
    `);
    $("toTeacherLogin")?.addEventListener("click", () => goTo("teacherAuth"));
    return;
  }

  const list = teacherClasses.length
    ? `
      <div class="list" style="margin-top:14px;">
        ${teacherClasses
          .map(c => {
            const name = escapeHtml(c.name || "Untitled class");
            const year = escapeHtml(c.schoolYear || "");
            const code = escapeHtml(c.joinCode || "");
            return `
              <div class="list-item">
                <div class="list-title">${name}</div>
                <div class="list-sub">School year: ${year || "-"}</div>
                <div class="list-sub">Class code: <strong>${code || "-"}</strong></div>
                <div class="actions">
                  <button class="btn-secondary btn-inline" type="button" data-open="${c.id}">
                    Open roster
                  </button>
                  <button class="btn-secondary btn-inline" type="button" data-del="${c.id}">
                    Delete
                  </button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `
    : `<p class="small-note" style="margin-top:14px;">No classes yet. Create one below.</p>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="tc">
      <h2 id="tc">Teacher classes</h2>
      <p>Create and manage your classes.</p>

      <div class="card" style="margin-top:12px;">
        <label for="className">Class name</label>
        <input id="className" type="text" placeholder="Example: Keating ATP" autocomplete="off" />

        <label for="schoolYear">School year</label>
        <input id="schoolYear" type="text" placeholder="Example: 2025-2026" autocomplete="off" />

        <button class="btn-primary" type="button" id="createClassBtn">
          Create class
        </button>

        <p id="createClassErr" class="error"></p>
      </div>

      <p id="classesErr" class="error"></p>

      ${list}

      <button class="btn-secondary" type="button" id="signOutBtn">
        Sign out
      </button>
    </section>
  `);

  $("createClassBtn")?.addEventListener("click", createClass);
  $("signOutBtn")?.addEventListener("click", appSignOut);

  document.querySelectorAll("[data-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open");
      if (id) openClass(id);
    });
  });

  document.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      if (id) deleteClass(id);
    });
  });
}

function renderClassDetailScreen() {
  if (!authUser || role !== "teacher") {
    goTo("teacherAuth");
    return;
  }

  if (!activeClass) {
    setAppHtml(`
      <section class="screen">
        <h2>Class roster</h2>
        <p>Select a class first.</p>
        <button class="btn-primary" type="button" id="backClasses">Back to classes</button>
      </section>
    `);
    $("backClasses")?.addEventListener("click", () => goTo("teacherClasses"));
    return;
  }

  const rosterHtml = classRoster.length
    ? classRoster
        .map(r => {
          const email = escapeHtml(r.email || "");
          return `
            <div class="list-item">
              <div class="list-title">${email}</div>
              <div class="actions">
                <button class="btn-secondary btn-inline" type="button" data-roster-del="${r.id}">
                  Remove
                </button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<p class="small-note">No roster entries yet.</p>`;

  const joinedHtml = classStudents.length
    ? classStudents
        .map(s => {
          const email = escapeHtml(s.email || "");
          const name = escapeHtml(s.name || "");
          return `
            <div class="list-item">
              <div class="list-title">${name || "Student"}</div>
              <div class="list-sub">${email}</div>
              <div class="list-sub">Joined</div>
            </div>
          `;
        })
        .join("")
    : `<p class="small-note">No students have joined yet.</p>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="cd">
      <h2 id="cd">Class roster</h2>

      <div class="card">
        <div><strong>Class:</strong> ${escapeHtml(activeClass.name)}</div>
        <div class="small-note">School year: ${escapeHtml(activeClass.schoolYear || "-")}</div>
        <div class="small-note">Students join using this code: <strong>${escapeHtml(activeClass.joinCode || "-")}</strong></div>
      </div>

      <div class="row" style="margin-top:14px;">
        <div class="card" style="flex:1; min-width:300px;">
          <h3 style="margin:0 0 8px; color:#064f58;">Teacher roster list</h3>
          <p class="small-note">This is the list you type in manually.</p>

          <label for="rosterEmail">Add student email</label>
          <input id="rosterEmail" type="email" placeholder="Example: 123456@student.auhsd.us" autocomplete="off" />
          <button class="btn-primary" type="button" id="addRosterBtn">Add to roster</button>
          <p id="rosterErr" class="error"></p>

          <div class="list" style="margin-top:12px;">
            ${rosterHtml}
          </div>
        </div>

        <div class="card" style="flex:1; min-width:300px;">
          <h3 style="margin:0 0 8px; color:#064f58;">Students who joined</h3>
          <p class="small-note">This list fills in when students sign in and enter the code.</p>

          <div class="list" style="margin-top:12px;">
            ${joinedHtml}
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top:14px;">
        <button class="btn-secondary btn-inline" type="button" id="backToClasses">
          Back to classes
        </button>
      </div>
    </section>
  `);

  $("addRosterBtn")?.addEventListener("click", addRosterStudent);
  $("backToClasses")?.addEventListener("click", () => goTo("teacherClasses"));

  document.querySelectorAll("[data-roster-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-roster-del");
      if (id) removeRosterStudent(id);
    });
  });
}

function renderStudentAuth() {
  const signedIn = !!authUser;

  setAppHtml(`
    <section class="screen" aria-labelledby="sa">
      <h2 id="sa">Student login</h2>

      ${
        signedIn && role === "student"
          ? `
            <div class="card">
              <p><strong>Signed in:</strong> ${escapeHtml(authUser.email || "")}</p>
              <div class="actions">
                <button class="btn-primary btn-inline" type="button" id="goStudentHome">
                  Go to student home
                </button>
                <button class="btn-secondary btn-inline" type="button" id="signOutStudent">
                  Sign out
                </button>
              </div>
            </div>
          `
          : `
            <p>Sign in using your school Google account.</p>

            <button class="google-btn" type="button" id="studentGoogle">
              <img alt="" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" />
              Sign in with Google
            </button>

            <p id="studentAuthErr" class="error"></p>

            <div class="card" style="margin-top:14px;">
              <p class="small-note" style="margin:0;">
                After sign in, you will enter your class code one time.
              </p>
            </div>
          `
      }

      <button class="btn-secondary" type="button" id="backLanding2">
        Back
      </button>
    </section>
  `);

  $("backLanding2")?.addEventListener("click", () => goTo("landing"));

  if (signedIn && role === "student") {
    $("goStudentHome")?.addEventListener("click", () => goTo("studentHome"));
    $("signOutStudent")?.addEventListener("click", appSignOut);
  } else {
    $("studentGoogle")?.addEventListener("click", async () => {
      await signInGoogleStudent();
      if (auth.currentUser) {
        await ensureStudentProfile(auth.currentUser);
      }
    });
  }
}

async function renderStudentHome() {
  if (!authUser || role !== "student") {
    goTo("studentAuth");
    return;
  }

  const ctx = await loadStudentClassContext();

  if (!ctx) {
    setAppHtml(`
      <section class="screen" aria-labelledby="sj">
        <h2 id="sj">Join your class</h2>
        <p>Enter the class code your teacher gave you.</p>

        <label for="joinCode">Class code</label>
        <input id="joinCode" type="text" placeholder="Example: A1B2C3" autocomplete="off" />

        <button class="btn-primary" type="button" id="joinBtn">
          Join class
        </button>

        <p id="joinErr" class="error"></p>

        <button class="btn-secondary" type="button" id="studentSignOut">
          Sign out
        </button>
      </section>
    `);

    $("joinBtn")?.addEventListener("click", joinClassWithCode);
    $("studentSignOut")?.addEventListener("click", appSignOut);
    return;
  }

  setAppHtml(`
    <section class="screen" aria-labelledby="sh">
      <h2 id="sh">Student home</h2>
      <p>Welcome. You are in this class.</p>

      <div class="card">
        <div><strong>Class:</strong> ${escapeHtml(ctx.name)}</div>
        <div class="small-note">School year: ${escapeHtml(ctx.schoolYear || "-")}</div>
      </div>

      <div class="card" style="margin-top:14px;">
        <p class="small-note" style="margin:0;">
          Next: we will bring back your student trip planning screens and save trips to Firestore.
        </p>
      </div>

      <button class="btn-secondary" type="button" id="studentSignOut2">
        Sign out
      </button>
    </section>
  `);

  $("studentSignOut2")?.addEventListener("click", appSignOut);
}

/* =========================================================
   AUTH LISTENER
========================================================= */

onAuthStateChanged(auth, async user => {
  authUser = user || null;
  activeClass = null;

  if (!authUser) {
    role = "none";
    cleanupTeacherRealtime();
    goTo("landing");
    return;
  }

  // Detect role
  const detected = await detectRoleForUser(authUser);

  if (detected === "teacher") {
    role = "teacher";
    await ensureTeacherProfile(authUser);
    startTeacherClassesRealtime(authUser.uid);

    if (currentScreen === "landing" || currentScreen === "teacherAuth" || currentScreen === "studentAuth") {
      goTo("teacherClasses");
      return;
    }
  }

  if (detected === "student") {
    role = "student";
    await ensureStudentProfile(authUser);

    if (currentScreen === "landing" || currentScreen === "studentAuth" || currentScreen === "teacherAuth") {
      goTo("studentHome");
      return;
    }
  }

  if (detected === "none") {
    role = "none";
    // If they signed in but have no role doc yet, send to landing so they pick.
    goTo("landing");
    return;
  }

  render();
});

/* =========================================================
   INIT
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  wireSidebar();
  render();
  highlightSidebar("landing");
});
