/* =========================================================
   CBI PLANNER PLATFORM
   Teacher + Student login
   Teacher classes + roster
   Student joins class with code once, then auto lands in class
   Student trip planning + save trips to Firestore
   Firebase v10 modular, loaded as type="module"
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

let role = "none"; // none | teacher | student

let activeClass = null; // { teacherUid, classId, name, schoolYear, joinCode }

// Teacher realtime caches
let teacherClasses = [];
let classRoster = [];
let classStudents = [];

let unsubTeacherClasses = null;
let unsubRoster = null;
let unsubStudents = null;

// Student realtime caches
let studentTrips = [];
let unsubStudentTrips = null;

// Student trip planner state (manual entry)
let currentTrip = buildEmptyTrip();
let openTripData = null; // for "open past trip" view

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

      // Teacher protected
      if (screen === "teacherClasses" || screen === "classDetail") {
        if (!authUser) return goTo("teacherAuth");
        if (role !== "teacher") return goTo("landing");
      }

      // Student protected
      if (screen === "studentHome" || screen === "studentPlan" || screen === "studentTrips") {
        if (!authUser) return goTo("studentAuth");
        if (role !== "student") return goTo("landing");
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
      if (currentScreen === "teacherClasses") setError("classesErr", err?.message || "Could not load classes.");
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
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
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

    await setDoc(doc(db, "classCodes", joinCode), {
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
    if (joinCode) await deleteDoc(doc(db, "classCodes", joinCode));
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
    const rosterRef = collection(db, "teachers", activeClass.teacherUid, "classes", activeClass.classId, "roster");
    await addDoc(rosterRef, { email, createdAt: serverTimestamp() });
    $("rosterEmail").value = "";
  } catch (err) {
    console.error(err);
    setError("rosterErr", err?.message || "Could not add roster student.");
  }
}

async function removeRosterStudent(rosterId) {
  if (!activeClass) return;
  try {
    await deleteDoc(doc(db, "teachers", activeClass.teacherUid, "classes", activeClass.classId, "roster", rosterId));
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not remove roster student.");
  }
}

/* =========================================================
   STUDENT DATA
========================================================= */

function cleanupStudentRealtime() {
  if (unsubStudentTrips) unsubStudentTrips();
  unsubStudentTrips = null;
  studentTrips = [];
}

async function ensureStudentProfile(user) {
  await setDoc(
    doc(db, "students", user.uid),
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
    const snap = await getDoc(doc(db, "classCodes", code));
    if (!snap.exists()) {
      setError("joinErr", "That class code was not found. Check the code and try again.");
      return;
    }

    const data = snap.data();
    const teacherUid = data.teacherUid;
    const classId = data.classId;

    await setDoc(
      doc(db, "students", authUser.uid),
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

    await setDoc(
      doc(db, "teachers", teacherUid, "classes", classId, "students", authUser.uid),
      {
        studentUid: authUser.uid,
        email: authUser.email || "",
        name: authUser.displayName || "",
        joinCode: code,
        joinedAt: serverTimestamp()
      },
      { merge: true }
    );

    activeClass = await loadStudentClassContext();
    startStudentTripsRealtime();
    goTo("studentHome");
  } catch (err) {
    console.error(err);
    setError("joinErr", err?.message || "Could not join class. Try again.");
  }
}

async function loadStudentClassContext() {
  if (!authUser) return null;

  const studentSnap = await getDoc(doc(db, "students", authUser.uid));
  if (!studentSnap.exists()) return null;

  const s = studentSnap.data();
  if (!s.classTeacherUid || !s.classId) return null;

  const classSnap = await getDoc(doc(db, "teachers", s.classTeacherUid, "classes", s.classId));
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

function startStudentTripsRealtime() {
  cleanupStudentRealtime();
  if (!authUser || !activeClass) return;

  const tripsRef = collection(
    db,
    "teachers",
    activeClass.teacherUid,
    "classes",
    activeClass.classId,
    "students",
    authUser.uid,
    "trips"
  );

  const q = query(tripsRef, orderBy("createdAt", "desc"));

  unsubStudentTrips = onSnapshot(
    q,
    snap => {
      studentTrips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "studentTrips") renderStudentTrips();
    },
    err => {
      console.error(err);
      if (currentScreen === "studentTrips") setError("tripsErr", err?.message || "Could not load trips.");
    }
  );
}

/* =========================================================
   TRIP STATE AND HELPERS
========================================================= */

function buildEmptyTrip() {
  return {
    destinationName: "",
    destinationAddress: "",
    tripDate: "",
    meetTime: "",

    routeThere: {
      busNumber: "",
      direction: "",
      boardStop: "",
      exitStop: "",
      departTime: "",
      arriveTime: "",
      totalTime: ""
    },

    routeBack: {
      busNumber: "",
      direction: "",
      boardStop: "",
      exitStop: "",
      departTime: "",
      arriveTime: "",
      totalTime: ""
    },

    purpose: {
      lifeSkills: false,
      communityAccess: false,
      moneySkills: false,
      communication: false,
      socialSkills: false,
      employmentPrep: false,
      recreationLeisure: false,
      safetySkills: false,
      otherText: ""
    },

    planning: {
      moneyNeeded: "",
      safetyRules: "",
      whatToBring: ""
    },

    reflection: {
      didItGoAsPlanned: "",
      whatWasEasy: "",
      whatWasHard: "",
      whatWouldYouDoDifferently: ""
    }
  };
}

function clearCurrentTrip() {
  currentTrip = buildEmptyTrip();
}

function updateTripField(field, value) {
  currentTrip[field] = value;
}

function updateRouteField(which, field, value) {
  currentTrip[which][field] = value;
}

function togglePurpose(field, checked) {
  currentTrip.purpose[field] = checked;
}

function updatePurposeOther(value) {
  currentTrip.purpose.otherText = value;
}

function updatePlanning(field, value) {
  currentTrip.planning[field] = value;
}

function updateReflection(field, value) {
  currentTrip.reflection[field] = value;
}

function openMapsForCurrentTrip() {
  const origin = "Katella High School, Anaheim, CA";
  const destination = `${currentTrip.destinationName} ${currentTrip.destinationAddress}`.trim();

  if (!destination) {
    alert("Enter a destination name and address first.");
    return;
  }

  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=transit`;
  window.open(url, "_blank");
}

function purposeSummaryLines(p) {
  const out = [];
  if (p.lifeSkills) out.push("Life skills");
  if (p.communityAccess) out.push("Community access and navigation");
  if (p.moneySkills) out.push("Money skills");
  if (p.communication) out.push("Communication and self advocacy");
  if (p.socialSkills) out.push("Social skills and teamwork");
  if (p.employmentPrep) out.push("Employment preparation or work skills");
  if (p.recreationLeisure) out.push("Recreation and leisure");
  if (p.safetySkills) out.push("Safety skills");
  if ((p.otherText || "").trim()) out.push(`Other: ${(p.otherText || "").trim()}`);
  return out.length ? out : ["No purposes selected"];
}

async function saveTripToFirestore() {
  setError("saveTripErr", "");

  if (!authUser || role !== "student") {
    setError("saveTripErr", "You must be signed in as a student.");
    return;
  }

  if (!activeClass) {
    setError("saveTripErr", "You must be in a class first.");
    return;
  }

  const dest = (currentTrip.destinationName || "").trim();
  if (!dest) {
    setError("saveTripErr", "Destination name is required before saving.");
    return;
  }

  try {
    const tripsRef = collection(
      db,
      "teachers",
      activeClass.teacherUid,
      "classes",
      activeClass.classId,
      "students",
      authUser.uid,
      "trips"
    );

    await addDoc(tripsRef, {
      trip: currentTrip,
      destinationName: currentTrip.destinationName || "",
      tripDate: currentTrip.tripDate || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    clearCurrentTrip();
    goTo("studentTrips");
  } catch (err) {
    console.error(err);
    setError("saveTripErr", err?.message || "Could not save trip.");
  }
}

function openTripById(tripId) {
  const found = studentTrips.find(t => t.id === tripId);
  if (!found) return;
  openTripData = found;
  goTo("studentTripView");
}

/* =========================================================
   RENDER ROUTER
========================================================= */

function render() {
  if (currentScreen === "landing") return renderLanding(); 
  if (currentScreen === "teacherAuth") return renderTeacherAuth();
  if (currentScreen === "teacherClasses") return renderTeacherClassesScreen();
  if (currentScreen === "classDetail") return renderClassDetailScreen();

  if (currentScreen === "studentAuth") return renderStudentAuth();
  if (currentScreen === "studentHome") return renderStudentHome();
  if (currentScreen === "studentPlan") return renderStudentPlan();
  if (currentScreen === "studentTrips") return renderStudentTrips();
  if (currentScreen === "studentTripView") return renderStudentTripView();

  renderLanding();
}

/* =========================================================
   LANDING
========================================================= */

function renderLanding() {
  setAppHtml(`
    <section class="screen" aria-labelledby="t">
      <h2 id="t">Welcome</h2>
      <p>Choose your role.</p>

      <div class="row" style="margin-top:12px;">
        <button class="btn-primary btn-inline" type="button" id="goTeacher">Teacher</button>
        <button class="btn-secondary btn-inline" type="button" id="goStudent">Student</button>
      </div>

      <div class="card" style="margin-top:14px;">
        <p class="small-note" style="margin:0;">
          Teachers create classes. Students join with a class code and plan trips by typing in details.
        </p>
      </div>
    </section>
  `);

  $("goTeacher")?.addEventListener("click", () => goTo("teacherAuth"));
  $("goStudent")?.addEventListener("click", () => goTo("studentAuth"));
}

/* =========================================================
   TEACHER AUTH
========================================================= */

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
                <button class="btn-primary btn-inline" type="button" id="goClasses">Go to classes</button>
                <button class="btn-secondary btn-inline" type="button" id="doSignOut">Sign out</button>
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
                After sign in, you will go to Teacher Classes.
              </p>
            </div>
          `
      }

      <button class="btn-secondary" type="button" id="backLanding">Back</button>
    </section>
  `);

  $("backLanding")?.addEventListener("click", () => goTo("landing"));

  if (signedIn && role === "teacher") {
    $("goClasses")?.addEventListener("click", () => goTo("teacherClasses"));
    $("doSignOut")?.addEventListener("click", appSignOut);
  } else {
    $("teacherGoogle")?.addEventListener("click", signInGoogleTeacher);
  }
}

/* =========================================================
   TEACHER CLASSES
========================================================= */

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
        ${teacherClasses.map(c => {
          const name = escapeHtml(c.name || "Untitled class");
          const year = escapeHtml(c.schoolYear || "");
          const code = escapeHtml(c.joinCode || "");
          return `
            <div class="list-item">
              <div class="list-title">${name}</div>
              <div class="list-sub">School year: ${year || "-"}</div>
              <div class="list-sub">Class code: <strong>${code || "-"}</strong></div>
              <div class="actions">
                <button class="btn-secondary btn-inline" type="button" data-open="${c.id}">Open roster</button>
                <button class="btn-secondary btn-inline" type="button" data-del="${c.id}">Delete</button>
              </div>
            </div>
          `;
        }).join("")}
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

        <button class="btn-primary" type="button" id="createClassBtn">Create class</button>
        <p id="createClassErr" class="error"></p>
      </div>

      <p id="classesErr" class="error"></p>

      ${list}

      <button class="btn-secondary" type="button" id="signOutBtn">Sign out</button>
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

/* =========================================================
   TEACHER CLASS DETAIL
========================================================= */

function renderClassDetailScreen() {
  if (!authUser || role !== "teacher") return goTo("teacherAuth");
  if (!activeClass) return goTo("teacherClasses");

  const rosterHtml = classRoster.length
    ? classRoster.map(r => `
        <div class="list-item">
          <div class="list-title">${escapeHtml(r.email || "")}</div>
          <div class="actions">
            <button class="btn-secondary btn-inline" type="button" data-roster-del="${r.id}">Remove</button>
          </div>
        </div>
      `).join("")
    : `<p class="small-note">No roster entries yet.</p>`;

  const joinedHtml = classStudents.length
    ? classStudents.map(s => `
        <div class="list-item">
          <div class="list-title">${escapeHtml(s.name || "Student")}</div>
          <div class="list-sub">${escapeHtml(s.email || "")}</div>
        </div>
      `).join("")
    : `<p class="small-note">No students have joined yet.</p>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="cd">
      <h2 id="cd">Class roster</h2>

      <div class="card">
        <div><strong>Class:</strong> ${escapeHtml(activeClass.name)}</div>
        <div class="small-note">School year: ${escapeHtml(activeClass.schoolYear || "-")}</div>
        <div class="small-note">Join code: <strong>${escapeHtml(activeClass.joinCode || "-")}</strong></div>
      </div>

      <div class="row" style="margin-top:14px;">
        <div class="card" style="flex:1; min-width:300px;">
          <h3 style="margin:0 0 8px;">Teacher roster list</h3>
          <p class="small-note">You type these in manually.</p>

          <label for="rosterEmail">Add student email</label>
          <input id="rosterEmail" type="email" placeholder="Example: 123456@student.auhsd.us" autocomplete="off" />
          <button class="btn-primary" type="button" id="addRosterBtn">Add to roster</button>
          <p id="rosterErr" class="error"></p>

          <div class="list" style="margin-top:12px;">
            ${rosterHtml}
          </div>
        </div>

        <div class="card" style="flex:1; min-width:300px;">
          <h3 style="margin:0 0 8px;">Students who joined</h3>
          <p class="small-note">This fills in after students sign in and enter the code.</p>

          <div class="list" style="margin-top:12px;">
            ${joinedHtml}
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top:14px;">
        <button class="btn-secondary btn-inline" type="button" id="backToClasses">Back to classes</button>
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

/* =========================================================
   STUDENT AUTH + HOME
========================================================= */

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
                <button class="btn-primary btn-inline" type="button" id="goStudentHome">Go to student home</button>
                <button class="btn-secondary btn-inline" type="button" id="signOutStudent">Sign out</button>
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
                After sign in, you will join your class with a code one time.
              </p>
            </div>
          `
      }

      <button class="btn-secondary" type="button" id="backLanding2">Back</button>
    </section>
  `);

  $("backLanding2")?.addEventListener("click", () => goTo("landing"));

  if (signedIn && role === "student") {
    $("goStudentHome")?.addEventListener("click", () => goTo("studentHome"));
    $("signOutStudent")?.addEventListener("click", appSignOut);
  } else {
    $("studentGoogle")?.addEventListener("click", signInGoogleStudent);
  }
}

async function renderStudentHome() {
  if (!authUser || role !== "student") return goTo("studentAuth");

  activeClass = await loadStudentClassContext();

  if (!activeClass) {
    setAppHtml(`
      <section class="screen" aria-labelledby="sj">
        <h2 id="sj">Join your class</h2>
        <p>Enter the class code your teacher gave you.</p>

        <label for="joinCode">Class code</label>
        <input id="joinCode" type="text" placeholder="Example: A1B2C3" autocomplete="off" />

        <button class="btn-primary" type="button" id="joinBtn">Join class</button>
        <p id="joinErr" class="error"></p>

        <button class="btn-secondary" type="button" id="studentSignOut">Sign out</button>
      </section>
    `);

    $("joinBtn")?.addEventListener("click", joinClassWithCode);
    $("studentSignOut")?.addEventListener("click", appSignOut);
    return;
  }

  startStudentTripsRealtime();

  setAppHtml(`
    <section class="screen" aria-labelledby="sh">
      <h2 id="sh">Student home</h2>
      <p>Welcome. You are in this class.</p>

      <div class="card">
        <div><strong>Class:</strong> ${escapeHtml(activeClass.name)}</div>
        <div class="small-note">School year: ${escapeHtml(activeClass.schoolYear || "-")}</div>
      </div>

      <div class="actions" style="margin-top:14px;">
        <button class="btn-primary btn-inline" type="button" id="planTripBtn">Plan a new trip</button>
        <button class="btn-secondary btn-inline" type="button" id="pastTripsBtn">Past trips</button>
      </div>

      <div class="card" style="margin-top:14px;">
        <p class="small-note" style="margin:0;">
          You will open Google Maps and type the route details yourself.
        </p>
      </div>

      <button class="btn-secondary" type="button" id="studentSignOut2">Sign out</button>
    </section>
  `);

  $("planTripBtn")?.addEventListener("click", () => goTo("studentPlan"));
  $("pastTripsBtn")?.addEventListener("click", () => goTo("studentTrips"));
  $("studentSignOut2")?.addEventListener("click", appSignOut);
}

/* =========================================================
   STUDENT PLAN A TRIP
========================================================= */

function renderStudentPlan() {
  if (!authUser || role !== "student") return goTo("studentAuth");
  if (!activeClass) return goTo("studentHome");

  const p = currentTrip.purpose;

  setAppHtml(`
    <section class="screen" aria-labelledby="sp">
      <h2 id="sp">Plan a trip</h2>
      <p>Fill out the steps. You do the thinking and typing.</p>

      <div class="card">
        <h3>Step 1: Basic info</h3>

        <label for="destName">Destination name</label>
        <input id="destName" type="text" placeholder="Example: Target" value="${escapeHtml(currentTrip.destinationName)}" />

        <label for="destAddress">Destination address</label>
        <input id="destAddress" type="text" placeholder="Street and city" value="${escapeHtml(currentTrip.destinationAddress)}" />

        <div class="grid-2">
          <div>
            <label for="tripDate">Date</label>
            <input id="tripDate" type="date" value="${escapeHtml(currentTrip.tripDate)}" />
          </div>
          <div>
            <label for="meetTime">Meet time</label>
            <input id="meetTime" type="time" value="${escapeHtml(currentTrip.meetTime)}" />
          </div>
        </div>

        <button class="btn-secondary" type="button" id="openMapsBtn">Open Google Maps (Transit)</button>

        <ol class="step-list">
          <li>Check the destination.</li>
          <li>Pick a transit route.</li>
          <li>Come back and type the details below.</li>
        </ol>
      </div>

      <div class="card" style="margin-top:14px;">
        <h3>Step 2: Route there</h3>

        <label for="thereBus">Bus number</label>
        <input id="thereBus" type="text" value="${escapeHtml(currentTrip.routeThere.busNumber)}" />

        <label for="thereDir">Direction</label>
        <input id="thereDir" type="text" value="${escapeHtml(currentTrip.routeThere.direction)}" />

        <label for="thereBoard">Stop where you get on</label>
        <input id="thereBoard" type="text" value="${escapeHtml(currentTrip.routeThere.boardStop)}" />

        <label for="thereExit">Stop where you get off</label>
        <input id="thereExit" type="text" value="${escapeHtml(currentTrip.routeThere.exitStop)}" />

        <div class="grid-2">
          <div>
            <label for="thereDepart">Depart time</label>
            <input id="thereDepart" type="text" placeholder="Example: 9:15 AM" value="${escapeHtml(currentTrip.routeThere.departTime)}" />
          </div>
          <div>
            <label for="thereArrive">Arrive time</label>
            <input id="thereArrive" type="text" placeholder="Example: 9:42 AM" value="${escapeHtml(currentTrip.routeThere.arriveTime)}" />
          </div>
        </div>

        <label for="thereTotal">Total travel time</label>
        <input id="thereTotal" type="text" placeholder="Example: 27 minutes" value="${escapeHtml(currentTrip.routeThere.totalTime)}" />
      </div>

      <div class="card" style="margin-top:14px;">
        <h3>Step 3: Route back</h3>

        <label for="backBus">Bus number</label>
        <input id="backBus" type="text" value="${escapeHtml(currentTrip.routeBack.busNumber)}" />

        <label for="backDir">Direction</label>
        <input id="backDir" type="text" value="${escapeHtml(currentTrip.routeBack.direction)}" />

        <label for="backBoard">Stop where you get on</label>
        <input id="backBoard" type="text" value="${escapeHtml(currentTrip.routeBack.boardStop)}" />

        <label for="backExit">Stop where you get off</label>
        <input id="backExit" type="text" value="${escapeHtml(currentTrip.routeBack.exitStop)}" />

        <div class="grid-2">
          <div>
            <label for="backDepart">Depart time</label>
            <input id="backDepart" type="text" placeholder="Example: 1:15 PM" value="${escapeHtml(currentTrip.routeBack.departTime)}" />
          </div>
          <div>
            <label for="backArrive">Arrive time</label>
            <input id="backArrive" type="text" placeholder="Example: 1:42 PM" value="${escapeHtml(currentTrip.routeBack.arriveTime)}" />
          </div>
        </div>

        <label for="backTotal">Total travel time</label>
        <input id="backTotal" type="text" placeholder="Example: 27 minutes" value="${escapeHtml(currentTrip.routeBack.totalTime)}" />
      </div>

      <div class="card" style="margin-top:14px;">
        <h3>Step 4: Purpose</h3>
        <p class="small-note">Check what skills you will practice.</p>

        <div class="purpose-grid">
          <label class="purpose-item"><input id="pLife" type="checkbox" ${p.lifeSkills ? "checked" : ""} /> Life skills</label>
          <label class="purpose-item"><input id="pComm" type="checkbox" ${p.communityAccess ? "checked" : ""} /> Community access</label>
          <label class="purpose-item"><input id="pMoney" type="checkbox" ${p.moneySkills ? "checked" : ""} /> Money skills</label>
          <label class="purpose-item"><input id="pTalk" type="checkbox" ${p.communication ? "checked" : ""} /> Communication</label>
          <label class="purpose-item"><input id="pSocial" type="checkbox" ${p.socialSkills ? "checked" : ""} /> Social skills</label>
          <label class="purpose-item"><input id="pWork" type="checkbox" ${p.employmentPrep ? "checked" : ""} /> Employment prep</label>
          <label class="purpose-item"><input id="pFun" type="checkbox" ${p.recreationLeisure ? "checked" : ""} /> Recreation</label>
          <label class="purpose-item"><input id="pSafe" type="checkbox" ${p.safetySkills ? "checked" : ""} /> Safety skills</label>
        </div>

        <label for="pOther">Other</label>
        <input id="pOther" type="text" value="${escapeHtml(currentTrip.purpose.otherText)}" />
      </div>

      <div class="card" style="margin-top:14px;">
        <h3>Step 5: Safety, money, packing</h3>

        <label for="moneyNeeded">How much money do you need?</label>
        <input id="moneyNeeded" type="text" placeholder="Example: $10" value="${escapeHtml(currentTrip.planning.moneyNeeded)}" />

        <label for="safetyRules">Safety rules to remember</label>
        <textarea id="safetyRules">${escapeHtml(currentTrip.planning.safetyRules)}</textarea>

        <label for="whatToBring">What will you bring?</label>
        <textarea id="whatToBring">${escapeHtml(currentTrip.planning.whatToBring)}</textarea>

        <div class="card" style="margin-top:12px;">
          <p class="small-note" style="margin:0;">
            Weather tip: open a weather website, then decide what to bring.
          </p>
          <div class="actions" style="margin-top:10px;">
            <button class="btn-secondary btn-inline" type="button" id="openAccu">Open AccuWeather</button>
            <button class="btn-secondary btn-inline" type="button" id="openWeatherCom">Open Weather.com</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px;">
        <h3>Step 6: Reflection</h3>
        <p class="small-note">You can fill this out after the trip.</p>

        <label for="didPlan">Did the route go as planned?</label>
        <input id="didPlan" type="text" value="${escapeHtml(currentTrip.reflection.didItGoAsPlanned)}" />

        <label for="easy">What was easy?</label>
        <textarea id="easy">${escapeHtml(currentTrip.reflection.whatWasEasy)}</textarea>

        <label for="hard">What was hard?</label>
        <textarea id="hard">${escapeHtml(currentTrip.reflection.whatWasHard)}</textarea>

        <label for="diff">What would you do differently next time?</label>
        <textarea id="diff">${escapeHtml(currentTrip.reflection.whatWouldYouDoDifferently)}</textarea>
      </div>

      <div class="card" style="margin-top:14px;">
        <h3>Save</h3>
        <p class="small-note">Saving creates a past trip record. You can open it later.</p>

        <div class="actions">
          <button class="btn-primary btn-inline" type="button" id="saveTripBtn">Save trip</button>
          <button class="btn-secondary btn-inline" type="button" id="clearTripBtn">Clear trip</button>
          <button class="btn-secondary btn-inline" type="button" id="backStudentHomeBtn">Back</button>
        </div>

        <p id="saveTripErr" class="error"></p>
      </div>
    </section>
  `);

  // Wire inputs into state
  $("destName").addEventListener("input", e => updateTripField("destinationName", e.target.value));
  $("destAddress").addEventListener("input", e => updateTripField("destinationAddress", e.target.value));
  $("tripDate").addEventListener("input", e => updateTripField("tripDate", e.target.value));
  $("meetTime").addEventListener("input", e => updateTripField("meetTime", e.target.value));

  $("thereBus").addEventListener("input", e => updateRouteField("routeThere", "busNumber", e.target.value));
  $("thereDir").addEventListener("input", e => updateRouteField("routeThere", "direction", e.target.value));
  $("thereBoard").addEventListener("input", e => updateRouteField("routeThere", "boardStop", e.target.value));
  $("thereExit").addEventListener("input", e => updateRouteField("routeThere", "exitStop", e.target.value));
  $("thereDepart").addEventListener("input", e => updateRouteField("routeThere", "departTime", e.target.value));
  $("thereArrive").addEventListener("input", e => updateRouteField("routeThere", "arriveTime", e.target.value));
  $("thereTotal").addEventListener("input", e => updateRouteField("routeThere", "totalTime", e.target.value));

  $("backBus").addEventListener("input", e => updateRouteField("routeBack", "busNumber", e.target.value));
  $("backDir").addEventListener("input", e => updateRouteField("routeBack", "direction", e.target.value));
  $("backBoard").addEventListener("input", e => updateRouteField("routeBack", "boardStop", e.target.value));
  $("backExit").addEventListener("input", e => updateRouteField("routeBack", "exitStop", e.target.value));
  $("backDepart").addEventListener("input", e => updateRouteField("routeBack", "departTime", e.target.value));
  $("backArrive").addEventListener("input", e => updateRouteField("routeBack", "arriveTime", e.target.value));
  $("backTotal").addEventListener("input", e => updateRouteField("routeBack", "totalTime", e.target.value));

  $("pLife").addEventListener("change", e => togglePurpose("lifeSkills", e.target.checked));
  $("pComm").addEventListener("change", e => togglePurpose("communityAccess", e.target.checked));
  $("pMoney").addEventListener("change", e => togglePurpose("moneySkills", e.target.checked));
  $("pTalk").addEventListener("change", e => togglePurpose("communication", e.target.checked));
  $("pSocial").addEventListener("change", e => togglePurpose("socialSkills", e.target.checked));
  $("pWork").addEventListener("change", e => togglePurpose("employmentPrep", e.target.checked));
  $("pFun").addEventListener("change", e => togglePurpose("recreationLeisure", e.target.checked));
  $("pSafe").addEventListener("change", e => togglePurpose("safetySkills", e.target.checked));
  $("pOther").addEventListener("input", e => updatePurposeOther(e.target.value));

  $("moneyNeeded").addEventListener("input", e => updatePlanning("moneyNeeded", e.target.value));
  $("safetyRules").addEventListener("input", e => updatePlanning("safetyRules", e.target.value));
  $("whatToBring").addEventListener("input", e => updatePlanning("whatToBring", e.target.value));

  $("didPlan").addEventListener("input", e => updateReflection("didItGoAsPlanned", e.target.value));
  $("easy").addEventListener("input", e => updateReflection("whatWasEasy", e.target.value));
  $("hard").addEventListener("input", e => updateReflection("whatWasHard", e.target.value));
  $("diff").addEventListener("input", e => updateReflection("whatWouldYouDoDifferently", e.target.value));

  // Wire buttons
  $("openMapsBtn").addEventListener("click", openMapsForCurrentTrip);

  $("openAccu").addEventListener("click", () => window.open("https://www.accuweather.com/", "_blank"));
  $("openWeatherCom").addEventListener("click", () => window.open("https://weather.com/", "_blank"));

  $("saveTripBtn").addEventListener("click", saveTripToFirestore);
  $("clearTripBtn").addEventListener("click", () => {
    const ok = confirm("Clear this trip form?");
    if (!ok) return;
    clearCurrentTrip();
    renderStudentPlan();
  });

  $("backStudentHomeBtn").addEventListener("click", () => goTo("studentHome"));
}

/* =========================================================
   STUDENT PAST TRIPS
========================================================= */

function renderStudentTrips() {
  if (!authUser || role !== "student") return goTo("studentAuth");
  if (!activeClass) return goTo("studentHome");

  const listHtml = studentTrips.length
    ? `
      <div class="list" style="margin-top:12px;">
        ${studentTrips.map(t => {
          const trip = t.trip || {};
          const name = escapeHtml(t.destinationName || trip.destinationName || "Trip");
          const date = escapeHtml(t.tripDate || trip.tripDate || "");
          return `
            <div class="list-item">
              <div class="list-title">${name}</div>
              <div class="list-sub">Date: ${date || "-"}</div>
              <div class="actions">
                <button class="btn-secondary btn-inline" type="button" data-open-trip="${t.id}">Open</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `
    : `<p class="small-note">No saved trips yet.</p>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="pt">
      <h2 id="pt">Past trips</h2>
      <p>These are your saved trips.</p>

      <p id="tripsErr" class="error"></p>

      ${listHtml}

      <div class="actions" style="margin-top:14px;">
        <button class="btn-primary btn-inline" type="button" id="newTripFromPast">Plan a new trip</button>
        <button class="btn-secondary btn-inline" type="button" id="backStudentHomeFromTrips">Back</button>
      </div>
    </section>
  `);

  document.querySelectorAll("[data-open-trip]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-trip");
      if (id) openTripById(id);
    });
  });

  $("newTripFromPast").addEventListener("click", () => goTo("studentPlan"));
  $("backStudentHomeFromTrips").addEventListener("click", () => goTo("studentHome"));
}

function renderStudentTripView() {
  if (!authUser || role !== "student") return goTo("studentAuth");
  if (!openTripData) return goTo("studentTrips");

  const trip = openTripData.trip || buildEmptyTrip();
  const purposeLines = purposeSummaryLines(trip.purpose || {}).map(x => `<li>${escapeHtml(x)}</li>`).join("");

  setAppHtml(`
    <section class="screen" aria-labelledby="tv">
      <h2 id="tv">Trip details</h2>
      <p class="small-note">Read only view. If you want to change it, plan a new trip.</p>

      <div class="summary-grid">
        <div class="card">
          <h3>Basic info</h3>
          <div class="summary-row"><span class="summary-label">Destination</span><span class="summary-value">${escapeHtml(trip.destinationName || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Address</span><span class="summary-value">${escapeHtml(trip.destinationAddress || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Date</span><span class="summary-value">${escapeHtml(trip.tripDate || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Meet time</span><span class="summary-value">${escapeHtml(trip.meetTime || "-")}</span></div>
        </div>

        <div class="card">
          <h3>Route there</h3>
          <div class="summary-row"><span class="summary-label">Bus</span><span class="summary-value">${escapeHtml(trip.routeThere?.busNumber || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Direction</span><span class="summary-value">${escapeHtml(trip.routeThere?.direction || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Get on</span><span class="summary-value">${escapeHtml(trip.routeThere?.boardStop || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Get off</span><span class="summary-value">${escapeHtml(trip.routeThere?.exitStop || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Depart</span><span class="summary-value">${escapeHtml(trip.routeThere?.departTime || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Arrive</span><span class="summary-value">${escapeHtml(trip.routeThere?.arriveTime || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Total</span><span class="summary-value">${escapeHtml(trip.routeThere?.totalTime || "-")}</span></div>
        </div>

        <div class="card">
          <h3>Route back</h3>
          <div class="summary-row"><span class="summary-label">Bus</span><span class="summary-value">${escapeHtml(trip.routeBack?.busNumber || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Direction</span><span class="summary-value">${escapeHtml(trip.routeBack?.direction || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Get on</span><span class="summary-value">${escapeHtml(trip.routeBack?.boardStop || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Get off</span><span class="summary-value">${escapeHtml(trip.routeBack?.exitStop || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Depart</span><span class="summary-value">${escapeHtml(trip.routeBack?.departTime || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Arrive</span><span class="summary-value">${escapeHtml(trip.routeBack?.arriveTime || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Total</span><span class="summary-value">${escapeHtml(trip.routeBack?.totalTime || "-")}</span></div>
        </div>

        <div class="card">
          <h3>Purpose</h3>
          <ul class="step-list">${purposeLines}</ul>
        </div>

        <div class="card">
          <h3>Safety, money, packing</h3>
          <div class="summary-row"><span class="summary-label">Money needed</span><span class="summary-value">${escapeHtml(trip.planning?.moneyNeeded || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Safety rules</span><span class="summary-value">${escapeHtml((trip.planning?.safetyRules || "-").slice(0, 40))}</span></div>
          <div class="summary-row"><span class="summary-label">What to bring</span><span class="summary-value">${escapeHtml((trip.planning?.whatToBring || "-").slice(0, 40))}</span></div>
        </div>

        <div class="card">
          <h3>Reflection</h3>
          <div class="summary-row"><span class="summary-label">Planned</span><span class="summary-value">${escapeHtml(trip.reflection?.didItGoAsPlanned || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Easy</span><span class="summary-value">${escapeHtml((trip.reflection?.whatWasEasy || "-").slice(0, 40))}</span></div>
          <div class="summary-row"><span class="summary-label">Hard</span><span class="summary-value">${escapeHtml((trip.reflection?.whatWasHard || "-").slice(0, 40))}</span></div>
          <div class="summary-row"><span class="summary-label">Next time</span><span class="summary-value">${escapeHtml((trip.reflection?.whatWouldYouDoDifferently || "-").slice(0, 40))}</span></div>
        </div>
      </div>

      <div class="actions" style="margin-top:14px;">
        <button class="btn-secondary btn-inline" type="button" id="backToTrips">Back to past trips</button>
      </div>
    </section>
  `);

  $("backToTrips").addEventListener("click", () => goTo("studentTrips"));
}

/* =========================================================
   AUTH LISTENER
========================================================= */

onAuthStateChanged(auth, async user => {
  authUser = user || null;
  activeClass = null;
  openTripData = null;

  cleanupTeacherRealtime();
  cleanupStudentRealtime();

  if (!authUser) {
    role = "none";
    goTo("landing");
    return;
  }

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
    activeClass = await loadStudentClassContext();
    if (activeClass) startStudentTripsRealtime();

    if (currentScreen === "landing" || currentScreen === "studentAuth" || currentScreen === "teacherAuth") {
      goTo("studentHome");
      return;
    }
  }

  if (detected === "none") {
    role = "none";
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
