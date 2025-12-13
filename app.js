/* =========================================================
   CBI PLANNER
   Teacher + Student login (Google)
   Teacher creates classes, adds students
   Student lands in their class automatically
   Student fills trip steps and saves trips to Firestore
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
  getDocs,
  query,
  orderBy,
  serverTimestamp
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

// Which role is actively using the app UI right now
// "teacher" or "student" or null
let activeRole = null;

// Teacher state
let teacherClasses = [];
let selectedTeacherClassId = null;

// Student state
let studentEnrollment = null; 
// studentEnrollment shape:
// { teacherUid, classId, className, studentName, studentEmail }

// Teacher view state
let selectedStudentUidForTeacher = null;
let selectedStudentNameForTeacher = "";

/* =========================================================
   TRIP STATE (STUDENT)
   Keep the thinking work on students
   ========================================================= */

const currentTrip = {
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

  packing: {
    moneyNeeded: "",
    safetyRules: "",
    whatToBring: ""
  }
};

/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setAppHtml(html) {
  const root = $("app");
  if (root) root.innerHTML = html;
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

function setActiveRole(role) {
  activeRole = role;
}

function goTo(screen) {
  currentScreen = screen;
  render();
  highlightSidebar();
}

function highlightSidebar() {
  document.querySelectorAll(".sidebar-item").forEach(btn => {
    const target = btn.getAttribute("data-screen");
    const active = target === currentScreen;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

/* =========================================================
   AUTH
   ========================================================= */

async function signInGoogleAsTeacher() {
  try {
    setActiveRole("teacher");
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    alert(err?.message || "Teacher sign in failed.");
  }
}

async function signInGoogleAsStudent() {
  try {
    setActiveRole("student");
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    alert(err?.message || "Student sign in failed.");
  }
}

async function appSignOut() {
  try {
    await signOut(auth);
    authUser = null;
    activeRole = null;
    studentEnrollment = null;
    teacherClasses = [];
    selectedTeacherClassId = null;
    selectedStudentUidForTeacher = null;
    selectedStudentNameForTeacher = "";
    goTo("landing");
  } catch (err) {
    console.error(err);
    alert("Sign out failed. Try again.");
  }
}

/* =========================================================
   FIRESTORE PATHS
   ========================================================= */

/*
  Teachers:
    /teachers/{teacherUid}
    /teachers/{teacherUid}/classes/{classId}
    /teachers/{teacherUid}/classes/{classId}/students/{studentUid}
    /teachers/{teacherUid}/classes/{classId}/students/{studentUid}/trips/{tripId}

  Enrollment shortcut:
    /enrollments/{studentUid}
    {
      teacherUid,
      classId,
      className,
      studentName,
      studentEmail,
      updatedAt
    }

  This makes student "auto land" easy.
*/

/* =========================================================
   TEACHER: PROFILE + CLASSES + ROSTER
   ========================================================= */

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

async function loadTeacherClasses() {
  if (!authUser) return;

  const classesRef = collection(db, "teachers", authUser.uid, "classes");
  const snap = await getDocs(query(classesRef, orderBy("createdAt", "desc")));

  teacherClasses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function teacherCreateClass() {
  if (!authUser) return;

  const name = prompt("Class name");
  if (!name) return;

  const year = prompt("School year (example: 2025-2026)") || "";

  const classesRef = collection(db, "teachers", authUser.uid, "classes");
  await addDoc(classesRef, {
    name: name.trim(),
    schoolYear: year.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await loadTeacherClasses();
  render();
}

function teacherOpenClass(classId) {
  selectedTeacherClassId = classId;
  goTo("teacherRoster");
}

async function teacherAddStudentToRoster() {
  if (!authUser || !selectedTeacherClassId) return;

  const studentEmail = (prompt("Student email (example: 123456@student.auhsd.us)") || "").trim();
  if (!studentEmail) return;

  const studentName = (prompt("Student name") || "").trim();

  // For student auto login to work, we need a UID.
  // Google login UID is not known until the student logs in.
  // Solution: create roster doc by email first, then link UID later.
  //
  // But you asked: student logs in and lands in class automatically.
  // To guarantee that, we will require you to add students AFTER they have logged in once,
  // OR you can use the enrollment shortcut keyed by UID once you have it.
  //
  // Practical school-friendly workflow:
  // 1) Student signs in once on a Chromebook
  // 2) You copy their UID from a teacher screen (we will show it)
  // 3) You click "Add student by UID" and they are enrolled forever

  alert(
    "Important:\n\nTo auto-place a student into a class, you need their student UID.\n\nNext screen will let you add students by UID.\n\nHave the student sign in once, then you can copy their UID."
  );

  goTo("teacherAddStudentUid");
}

async function teacherAddStudentByUid(uid, name, email) {
  if (!authUser || !selectedTeacherClassId) return;

  const classRef = doc(db, "teachers", authUser.uid, "classes", selectedTeacherClassId);
  const classSnap = await getDoc(classRef);
  const classData = classSnap.exists() ? classSnap.data() : {};
  const className = classData?.name || "Class";

  // 1) Write roster record
  const studentRef = doc(
    db,
    "teachers",
    authUser.uid,
    "classes",
    selectedTeacherClassId,
    "students",
    uid
  );

  await setDoc(
    studentRef,
    {
      name: name || "",
      email: email || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  // 2) Write enrollment shortcut
  const enrollmentRef = doc(db, "enrollments", uid);
  await setDoc(
    enrollmentRef,
    {
      teacherUid: authUser.uid,
      classId: selectedTeacherClassId,
      className: className,
      studentName: name || "",
      studentEmail: email || "",
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  goTo("teacherRoster");
}

async function teacherLoadRoster() {
  if (!authUser || !selectedTeacherClassId) return [];

  const rosterRef = collection(
    db,
    "teachers",
    authUser.uid,
    "classes",
    selectedTeacherClassId,
    "students"
  );

  const snap = await getDocs(query(rosterRef, orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

async function teacherViewStudentTrips(studentUid, studentName) {
  selectedStudentUidForTeacher = studentUid;
  selectedStudentNameForTeacher = studentName || "";
  goTo("teacherStudentTrips");
}

async function teacherLoadStudentTrips(studentUid) {
  if (!authUser || !selectedTeacherClassId || !studentUid) return [];

  const tripsRef = collection(
    db,
    "teachers",
    authUser.uid,
    "classes",
    selectedTeacherClassId,
    "students",
    studentUid,
    "trips"
  );

  const snap = await getDocs(query(tripsRef, orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* =========================================================
   STUDENT: ENROLLMENT + TRIPS
   ========================================================= */

async function loadStudentEnrollment(uid) {
  const enrollmentRef = doc(db, "enrollments", uid);
  const snap = await getDoc(enrollmentRef);

  if (!snap.exists()) {
    return null;
  }

  return snap.data();
}

async function studentSaveTrip() {
  if (!authUser) return;
  if (!studentEnrollment) {
    alert("You are not enrolled in a class yet. Ask your teacher.");
    return;
  }

  const teacherUid = studentEnrollment.teacherUid;
  const classId = studentEnrollment.classId;
  const studentUid = authUser.uid;

  const tripsRef = collection(
    db,
    "teachers",
    teacherUid,
    "classes",
    classId,
    "students",
    studentUid,
    "trips"
  );

  await addDoc(tripsRef, {
    studentUid: studentUid,
    studentEmail: authUser.email || "",
    studentName: authUser.displayName || "",
    trip: JSON.parse(JSON.stringify(currentTrip)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  alert("Trip saved.");
  goTo("studentPastTrips");
}

async function studentLoadPastTrips() {
  if (!authUser || !studentEnrollment) return [];

  const teacherUid = studentEnrollment.teacherUid;
  const classId = studentEnrollment.classId;

  const tripsRef = collection(
    db,
    "teachers",
    teacherUid,
    "classes",
    classId,
    "students",
    authUser.uid,
    "trips"
  );

  const snap = await getDocs(query(tripsRef, orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* =========================================================
   STUDENT: MAPS BUTTON
   ========================================================= */

function openMapsForCurrentTrip() {
  const origin = "Katella High School, Anaheim, CA";
  const destination = `${currentTrip.destinationName} ${currentTrip.destinationAddress}`.trim();

  if (!destination) {
    alert("Enter destination name and address first.");
    return;
  }

  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin
  )}&destination=${encodeURIComponent(destination)}&travelmode=transit`;

  window.open(url, "_blank");
}

/* =========================================================
   STUDENT: PURPOSE SUMMARY
   ========================================================= */

function purposeSummaryListHtml() {
  const p = currentTrip.purpose;
  const items = [];

  if (p.lifeSkills) items.push("Life skills");
  if (p.communityAccess) items.push("Community access");
  if (p.moneySkills) items.push("Money skills");
  if (p.communication) items.push("Communication and self advocacy");
  if (p.socialSkills) items.push("Social skills");
  if (p.employmentPrep) items.push("Employment prep");
  if (p.recreationLeisure) items.push("Recreation and leisure");
  if (p.safetySkills) items.push("Safety skills");
  if ((p.otherText || "").trim()) items.push(`Other: ${(p.otherText || "").trim()}`);

  if (!items.length) return "<li>None selected yet.</li>";
  return items.map(x => `<li>${escapeHtml(x)}</li>`).join("");
}

/* =========================================================
   RENDER
   ========================================================= */

function render() {
  if (currentScreen === "landing") {
    setAppHtml(`
      <section class="screen" aria-labelledby="landingTitle">
        <h2 id="landingTitle">Welcome</h2>
        <p>Choose your mode.</p>

        <div class="row" style="margin-top:12px;">
          <button class="btn-primary" type="button" id="btnTeacher">
            Teacher
          </button>
          <button class="btn-secondary" type="button" id="btnStudent">
            Student
          </button>
        </div>

        <div class="card">
          <div class="card-title">How this tool works</div>
          <p class="muted">
            Google Maps helps only with the map. Students still read and type the route details.
            Trips save so teachers can review progress.
          </p>
        </div>
      </section>
    `);

    $("btnTeacher")?.addEventListener("click", () => goTo("teacherAuth"));
    $("btnStudent")?.addEventListener("click", () => goTo("studentAuth"));
    return;
  }

  if (currentScreen === "teacherAuth") {
    const signedIn = !!authUser && activeRole === "teacher";

    setAppHtml(`
      <section class="screen" aria-labelledby="tAuthTitle">
        <h2 id="tAuthTitle">Teacher login</h2>

        ${
          signedIn
            ? `
              <div class="card">
                <div class="card-title">Signed in</div>
                <div class="summary-row">
                  <span class="summary-label">Email</span>
                  <span class="summary-value">${escapeHtml(authUser.email || "-")}</span>
                </div>
              </div>

              <button class="btn-primary" type="button" id="btnGoClasses">
                Go to classes
              </button>

              <button class="btn-secondary" type="button" id="btnSignOut">
                Sign out
              </button>
            `
            : `
              <p>Sign in with your school Google account.</p>

              <button class="btn-primary" type="button" id="btnTeacherGoogle">
                Sign in with Google
              </button>

              <button class="btn-secondary" type="button" id="btnBack">
                Back
              </button>
            `
        }
      </section>
    `);

    if (signedIn) {
      $("btnGoClasses")?.addEventListener("click", () => goTo("teacherClasses"));
      $("btnSignOut")?.addEventListener("click", appSignOut);
    } else {
      $("btnTeacherGoogle")?.addEventListener("click", signInGoogleAsTeacher);
      $("btnBack")?.addEventListener("click", () => goTo("landing"));
    }
    return;
  }

  if (currentScreen === "teacherClasses") {
    renderTeacherClassesScreen();
    return;
  }

  if (currentScreen === "teacherRoster") {
    renderTeacherRosterScreen();
    return;
  }

  if (currentScreen === "teacherAddStudentUid") {
    renderTeacherAddStudentUidScreen();
    return;
  }

  if (currentScreen === "teacherStudentTrips") {
    renderTeacherStudentTripsScreen();
    return;
  }

  if (currentScreen === "studentAuth") {
    const signedIn = !!authUser && activeRole === "student";

    setAppHtml(`
      <section class="screen" aria-labelledby="sAuthTitle">
        <h2 id="sAuthTitle">Student login</h2>

        ${
          signedIn
            ? `
              <div class="card">
                <div class="card-title">Signed in</div>
                <div class="summary-row">
                  <span class="summary-label">Email</span>
                  <span class="summary-value">${escapeHtml(authUser.email || "-")}</span>
                </div>
              </div>

              <button class="btn-primary" type="button" id="btnStudentContinue">
                Continue
              </button>

              <button class="btn-secondary" type="button" id="btnSignOut">
                Sign out
              </button>
            `
            : `
              <p>Sign in with your school Google account.</p>

              <button class="btn-primary" type="button" id="btnStudentGoogle">
                Sign in with Google
              </button>

              <button class="btn-secondary" type="button" id="btnBack">
                Back
              </button>
            `
        }
      </section>
    `);

    if (signedIn) {
      $("btnStudentContinue")?.addEventListener("click", () => goTo("studentHome"));
      $("btnSignOut")?.addEventListener("click", appSignOut);
    } else {
      $("btnStudentGoogle")?.addEventListener("click", signInGoogleAsStudent);
      $("btnBack")?.addEventListener("click", () => goTo("landing"));
    }
    return;
  }

  if (currentScreen === "studentHome") {
    renderStudentHomeScreen();
    return;
  }

  if (currentScreen === "planDestination") {
    renderStudentStep1();
    return;
  }

  if (currentScreen === "mapsInstructions") {
    renderStudentStep2();
    return;
  }

  if (currentScreen === "routeDetails") {
    renderStudentStep3and4and5();
    return;
  }

  if (currentScreen === "summary") {
    renderStudentSummary();
    return;
  }

  if (currentScreen === "studentPastTrips") {
    renderStudentPastTrips();
    return;
  }

  setAppHtml(`
    <section class="screen">
      <h2>Unknown screen</h2>
      <button class="btn-secondary" type="button" onclick="goTo('landing')">Back</button>
    </section>
  `);
}

/* =========================================================
   TEACHER RENDERS
   ========================================================= */

async function renderTeacherClassesScreen() {
  if (!authUser || activeRole !== "teacher") {
    goTo("teacherAuth");
    return;
  }

  await loadTeacherClasses();

  const list = teacherClasses.length
    ? teacherClasses
        .map(c => {
          const name = escapeHtml(c.name || "Untitled class");
          const year = escapeHtml(c.schoolYear || "");
          return `
            <div class="card">
              <div class="card-title">${name}</div>
              ${year ? `<div class="muted">School year: ${year}</div>` : ""}
              <div class="row" style="margin-top:10px;">
                <button class="btn-secondary" type="button" data-open-class="${c.id}">
                  Open roster
                </button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="card"><div class="muted">No classes yet.</div></div>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="tClassesTitle">
      <h2 id="tClassesTitle">Teacher classes</h2>
      <p>Create a class, then add students.</p>

      <div class="row">
        <button class="btn-primary" type="button" id="btnCreateClass">
          Create class
        </button>
        <button class="btn-secondary" type="button" id="btnSignOut">
          Sign out
        </button>
      </div>

      ${list}

      <button class="btn-secondary" type="button" id="btnBack">
        Back
      </button>
    </section>
  `);

  $("btnCreateClass")?.addEventListener("click", teacherCreateClass);
  $("btnSignOut")?.addEventListener("click", appSignOut);
  $("btnBack")?.addEventListener("click", () => goTo("landing"));

  document.querySelectorAll("[data-open-class]").forEach(btn => {
    btn.addEventListener("click", () => {
      const classId = btn.getAttribute("data-open-class");
      if (classId) teacherOpenClass(classId);
    });
  });
}

async function renderTeacherRosterScreen() {
  if (!authUser || activeRole !== "teacher") {
    goTo("teacherAuth");
    return;
  }

  if (!selectedTeacherClassId) {
    goTo("teacherClasses");
    return;
  }

  const roster = await teacherLoadRoster();

  const rosterHtml = roster.length
    ? roster
        .map(s => {
          const name = escapeHtml(s.name || "(No name)");
          const email = escapeHtml(s.email || "");
          const uid = escapeHtml(s.uid || "");
          return `
            <div class="card">
              <div class="card-title">${name}</div>
              ${email ? `<div class="muted">${email}</div>` : ""}
              <div class="muted">UID: ${uid}</div>

              <div class="row" style="margin-top:10px;">
                <button class="btn-secondary" type="button" data-view-student="${uid}" data-student-name="${name}">
                  View trips
                </button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="card"><div class="muted">No students yet.</div></div>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="tRosterTitle">
      <h2 id="tRosterTitle">Class roster</h2>
      <p>Add students by UID so they auto-land in this class after login.</p>

      <div class="row">
        <button class="btn-primary" type="button" id="btnAddStudentUid">
          Add student by UID
        </button>

        <button class="btn-secondary" type="button" id="btnBackClasses">
          Back to classes
        </button>
      </div>

      ${rosterHtml}
    </section>
  `);

  $("btnAddStudentUid")?.addEventListener("click", () => goTo("teacherAddStudentUid"));
  $("btnBackClasses")?.addEventListener("click", () => goTo("teacherClasses"));

  document.querySelectorAll("[data-view-student]").forEach(btn => {
    btn.addEventListener("click", () => {
      const uid = btn.getAttribute("data-view-student");
      const nm = btn.getAttribute("data-student-name") || "";
      if (uid) teacherViewStudentTrips(uid, nm);
    });
  });
}

function renderTeacherAddStudentUidScreen() {
  if (!authUser || activeRole !== "teacher") {
    goTo("teacherAuth");
    return;
  }

  setAppHtml(`
    <section class="screen" aria-labelledby="addUidTitle">
      <h2 id="addUidTitle">Add student by UID</h2>

      <div class="card">
        <div class="card-title">How to get the UID</div>
        <p class="muted">
          Have the student sign in one time on a Chromebook using Student login.
          Then the student will see their UID on Student home. Copy it here.
        </p>
      </div>

      <label for="uidInput">Student UID</label>
      <input id="uidInput" type="text" placeholder="Paste UID" autocomplete="off" />

      <label for="nameInput">Student name</label>
      <input id="nameInput" type="text" placeholder="Example: John S." autocomplete="off" />

      <label for="emailInput">Student email</label>
      <input id="emailInput" type="text" placeholder="Example: 123456@student.auhsd.us" autocomplete="off" />

      <button class="btn-primary" type="button" id="btnSaveStudent">
        Add student
      </button>

      <button class="btn-secondary" type="button" id="btnBack">
        Back
      </button>

      <div id="addUidError" class="error"></div>
    </section>
  `);

  $("btnSaveStudent")?.addEventListener("click", async () => {
    const uid = ($("uidInput")?.value || "").trim();
    const name = ($("nameInput")?.value || "").trim();
    const email = ($("emailInput")?.value || "").trim();

    if (!uid) {
      $("addUidError").textContent = "UID is required.";
      return;
    }

    $("addUidError").textContent = "";

    try {
      await teacherAddStudentByUid(uid, name, email);
    } catch (err) {
      console.error(err);
      $("addUidError").textContent = err?.message || "Could not add student.";
    }
  });

  $("btnBack")?.addEventListener("click", () => goTo("teacherRoster"));
}

async function renderTeacherStudentTripsScreen() {
  if (!authUser || activeRole !== "teacher") {
    goTo("teacherAuth");
    return;
  }

  if (!selectedStudentUidForTeacher) {
    goTo("teacherRoster");
    return;
  }

  const trips = await teacherLoadStudentTrips(selectedStudentUidForTeacher);

  const tripsHtml = trips.length
    ? trips
        .map(t => {
          const trip = t.trip || {};
          const dest = escapeHtml(trip.destinationName || "-");
          const date = escapeHtml(trip.tripDate || "-");
          return `
            <div class="card">
              <div class="card-title">${dest}</div>
              <div class="muted">Date: ${date}</div>
            </div>
          `;
        })
        .join("")
    : `<div class="card"><div class="muted">No saved trips yet.</div></div>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="tTripsTitle">
      <h2 id="tTripsTitle">Student trips</h2>
      <p>Student: ${escapeHtml(selectedStudentNameForTeacher || "")}</p>

      ${tripsHtml}

      <button class="btn-secondary" type="button" id="btnBack">
        Back to roster
      </button>
    </section>
  `);

  $("btnBack")?.addEventListener("click", () => goTo("teacherRoster"));
}

/* =========================================================
   STUDENT RENDERS
   ========================================================= */

async function renderStudentHomeScreen() {
  if (!authUser || activeRole !== "student") {
    goTo("studentAuth");
    return;
  }

  // Load enrollment
  studentEnrollment = await loadStudentEnrollment(authUser.uid);

  if (!studentEnrollment) {
    setAppHtml(`
      <section class="screen" aria-labelledby="sHomeTitle">
        <h2 id="sHomeTitle">Student home</h2>

        <div class="card">
          <div class="card-title">Not enrolled yet</div>
          <p class="muted">
            Ask your teacher to add you to a class using your UID.
          </p>
          <p class="muted">
            Your UID is:
          </p>
          <div class="card" style="margin-top:10px;">
            <div class="card-title">${escapeHtml(authUser.uid)}</div>
          </div>
        </div>

        <button class="btn-secondary" type="button" id="btnSignOut">
          Sign out
        </button>
      </section>
    `);

    $("btnSignOut")?.addEventListener("click", appSignOut);
    return;
  }

  setAppHtml(`
    <section class="screen" aria-labelledby="sHomeTitle">
      <h2 id="sHomeTitle">Student home</h2>

      <div class="card">
        <div class="card-title">Your class</div>
        <div class="summary-row">
          <span class="summary-label">Class</span>
          <span class="summary-value">${escapeHtml(studentEnrollment.className || "-")}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Your UID</div>
        <p class="muted">If your teacher needs it, copy this:</p>
        <div class="card" style="margin-top:10px;">
          <div class="card-title">${escapeHtml(authUser.uid)}</div>
        </div>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="btn-primary" type="button" id="btnStartTrip">
          Start a new trip
        </button>
        <button class="btn-secondary" type="button" id="btnPast">
          Past trips
        </button>
      </div>

      <button class="btn-secondary" type="button" id="btnSignOut">
        Sign out
      </button>
    </section>
  `);

  $("btnStartTrip")?.addEventListener("click", () => goTo("planDestination"));
  $("btnPast")?.addEventListener("click", () => goTo("studentPastTrips"));
  $("btnSignOut")?.addEventListener("click", appSignOut);
}

function renderStudentStep1() {
  if (!authUser || activeRole !== "student") {
    goTo("studentAuth");
    return;
  }

  setAppHtml(`
    <section class="screen" aria-labelledby="step1Title">
      <h2 id="step1Title">Step 1 - Basic info</h2>
      <p>Type the basic information for your trip.</p>

      <label for="destName">Destination name</label>
      <input id="destName" type="text" value="${escapeHtml(currentTrip.destinationName)}" placeholder="Example: Target" />

      <label for="destAddress">Destination address</label>
      <input id="destAddress" type="text" value="${escapeHtml(currentTrip.destinationAddress)}" placeholder="Street, city" />

      <label for="tripDate">Date of trip</label>
      <input id="tripDate" type="date" value="${escapeHtml(currentTrip.tripDate)}" />

      <label for="meetTime">Meet time</label>
      <input id="meetTime" type="time" value="${escapeHtml(currentTrip.meetTime)}" />

      <button class="btn-primary" type="button" id="btnNext">
        Go to Step 2
      </button>

      <button class="btn-secondary" type="button" id="btnBack">
        Back
      </button>
    </section>
  `);

  $("btnNext")?.addEventListener("click", () => {
    currentTrip.destinationName = ($("destName")?.value || "").trim();
    currentTrip.destinationAddress = ($("destAddress")?.value || "").trim();
    currentTrip.tripDate = ($("tripDate")?.value || "").trim();
    currentTrip.meetTime = ($("meetTime")?.value || "").trim();
    goTo("mapsInstructions");
  });

  $("btnBack")?.addEventListener("click", () => goTo("studentHome"));
}

function renderStudentStep2() {
  if (!authUser || activeRole !== "student") {
    goTo("studentAuth");
    return;
  }

  setAppHtml(`
    <section class="screen" aria-labelledby="step2Title">
      <h2 id="step2Title">Step 2 - Google Maps</h2>
      <p>Use Google Maps to find a transit route. Then come back and type the details yourself.</p>

      <ol class="step-list">
        <li>Open Google Maps using the button below.</li>
        <li>Check that your destination is correct.</li>
        <li>Select Transit.</li>
        <li>Choose a route that you can follow.</li>
        <li>Write down the bus number, stops, and times.</li>
        <li>Return here and type the route details in Step 3.</li>
      </ol>

      <button class="btn-primary" type="button" id="btnOpenMaps">
        Open Google Maps (Transit)
      </button>

      <button class="btn-primary" type="button" id="btnNext">
        Go to Step 3 and 4
      </button>

      <button class="btn-secondary" type="button" id="btnBack">
        Back
      </button>
    </section>
  `);

  $("btnOpenMaps")?.addEventListener("click", openMapsForCurrentTrip);
  $("btnNext")?.addEventListener("click", () => goTo("routeDetails"));
  $("btnBack")?.addEventListener("click", () => goTo("planDestination"));
}

function renderStudentStep3and4and5() {
  if (!authUser || activeRole !== "student") {
    goTo("studentAuth");
    return;
  }

  const r = currentTrip.routeThere;
  const rb = currentTrip.routeBack;
  const p = currentTrip.purpose;
  const pack = currentTrip.packing;

  setAppHtml(`
    <section class="screen" aria-labelledby="step3Title">
      <h2 id="step3Title">Step 3 - Route details</h2>
      <p>Type what you found in Google Maps.</p>

      <div class="card">
        <div class="card-title">Route there</div>

        <label>Bus number</label>
        <input id="rt_bus" type="text" value="${escapeHtml(r.busNumber)}" placeholder="Example: 47" />

        <label>Direction</label>
        <input id="rt_dir" type="text" value="${escapeHtml(r.direction)}" placeholder="Example: To Anaheim" />

        <label>Get on stop</label>
        <input id="rt_on" type="text" value="${escapeHtml(r.boardStop)}" />

        <label>Get off stop</label>
        <input id="rt_off" type="text" value="${escapeHtml(r.exitStop)}" />

        <label>Depart time</label>
        <input id="rt_dep" type="text" value="${escapeHtml(r.departTime)}" placeholder="Example: 8:48 AM" />

        <label>Arrive time</label>
        <input id="rt_arr" type="text" value="${escapeHtml(r.arriveTime)}" placeholder="Example: 9:12 AM" />

        <label>Total travel time</label>
        <input id="rt_total" type="text" value="${escapeHtml(r.totalTime)}" placeholder="Example: 24 minutes" />
      </div>

      <div class="card">
        <div class="card-title">Route back</div>

        <label>Bus number</label>
        <input id="rb_bus" type="text" value="${escapeHtml(rb.busNumber)}" />

        <label>Direction</label>
        <input id="rb_dir" type="text" value="${escapeHtml(rb.direction)}" />

        <label>Get on stop</label>
        <input id="rb_on" type="text" value="${escapeHtml(rb.boardStop)}" />

        <label>Get off stop</label>
        <input id="rb_off" type="text" value="${escapeHtml(rb.exitStop)}" />

        <label>Depart time</label>
        <input id="rb_dep" type="text" value="${escapeHtml(rb.departTime)}" />

        <label>Arrive time</label>
        <input id="rb_arr" type="text" value="${escapeHtml(rb.arriveTime)}" />

        <label>Total travel time</label>
        <input id="rb_total" type="text" value="${escapeHtml(rb.totalTime)}" />
      </div>

      <div class="card">
        <div class="card-title">Step 4 - Why are we going?</div>

        <div class="purpose-grid">
          <label class="purpose-item"><input id="p_life" type="checkbox" ${p.lifeSkills ? "checked" : ""} /> Life skills</label>
          <label class="purpose-item"><input id="p_comm" type="checkbox" ${p.communityAccess ? "checked" : ""} /> Community access</label>
          <label class="purpose-item"><input id="p_money" type="checkbox" ${p.moneySkills ? "checked" : ""} /> Money skills</label>
          <label class="purpose-item"><input id="p_talk" type="checkbox" ${p.communication ? "checked" : ""} /> Communication</label>
          <label class="purpose-item"><input id="p_social" type="checkbox" ${p.socialSkills ? "checked" : ""} /> Social skills</label>
          <label class="purpose-item"><input id="p_job" type="checkbox" ${p.employmentPrep ? "checked" : ""} /> Employment prep</label>
          <label class="purpose-item"><input id="p_rec" type="checkbox" ${p.recreationLeisure ? "checked" : ""} /> Recreation and leisure</label>
          <label class="purpose-item"><input id="p_safe" type="checkbox" ${p.safetySkills ? "checked" : ""} /> Safety skills</label>
        </div>

        <label>Other</label>
        <input id="p_other" type="text" value="${escapeHtml(p.otherText)}" placeholder="Write your own reason" />
      </div>

      <div class="card">
        <div class="card-title">Step 5 - Safety, money, packing</div>

        <label>How much money do you need?</label>
        <input id="pack_money" type="text" value="${escapeHtml(pack.moneyNeeded)}" placeholder="Example: $10 for snack" />

        <label>What safety rules will you remember?</label>
        <textarea id="pack_safety" placeholder="Example: stay with group, cross at crosswalk">${escapeHtml(pack.safetyRules)}</textarea>

        <label>What will you bring?</label>
        <textarea id="pack_bring" placeholder="Example: water, jacket, bus pass">${escapeHtml(pack.whatToBring)}</textarea>
      </div>

      <button class="btn-primary" type="button" id="btnNext">
        View trip summary
      </button>

      <button class="btn-secondary" type="button" id="btnBack">
        Back
      </button>
    </section>
  `);

  $("btnNext")?.addEventListener("click", () => {
    // Route there
    r.busNumber = ($("rt_bus")?.value || "").trim();
    r.direction = ($("rt_dir")?.value || "").trim();
    r.boardStop = ($("rt_on")?.value || "").trim();
    r.exitStop = ($("rt_off")?.value || "").trim();
    r.departTime = ($("rt_dep")?.value || "").trim();
    r.arriveTime = ($("rt_arr")?.value || "").trim();
    r.totalTime = ($("rt_total")?.value || "").trim();

    // Route back
    rb.busNumber = ($("rb_bus")?.value || "").trim();
    rb.direction = ($("rb_dir")?.value || "").trim();
    rb.boardStop = ($("rb_on")?.value || "").trim();
    rb.exitStop = ($("rb_off")?.value || "").trim();
    rb.departTime = ($("rb_dep")?.value || "").trim();
    rb.arriveTime = ($("rb_arr")?.value || "").trim();
    rb.totalTime = ($("rb_total")?.value || "").trim();

    // Purpose
    p.lifeSkills = !!$("p_life")?.checked;
    p.communityAccess = !!$("p_comm")?.checked;
    p.moneySkills = !!$("p_money")?.checked;
    p.communication = !!$("p_talk")?.checked;
    p.socialSkills = !!$("p_social")?.checked;
    p.employmentPrep = !!$("p_job")?.checked;
    p.recreationLeisure = !!$("p_rec")?.checked;
    p.safetySkills = !!$("p_safe")?.checked;
    p.otherText = ($("p_other")?.value || "").trim();

    // Packing
    pack.moneyNeeded = ($("pack_money")?.value || "").trim();
    pack.safetyRules = ($("pack_safety")?.value || "").trim();
    pack.whatToBring = ($("pack_bring")?.value || "").trim();

    goTo("summary");
  });

  $("btnBack")?.addEventListener("click", () => goTo("mapsInstructions"));
}

function renderStudentSummary() {
  if (!authUser || activeRole !== "student") {
    goTo("studentAuth");
    return;
  }

  const pHtml = purposeSummaryListHtml();

  setAppHtml(`
    <section class="screen" aria-labelledby="sumTitle">
      <h2 id="sumTitle">Trip summary</h2>
      <p>Review your plan. You did the thinking work. Save it when you are ready.</p>

      <div class="summary-grid">
        <div class="card">
          <div class="card-title">Trip basics</div>
          <div class="summary-row"><span class="summary-label">Destination</span><span class="summary-value">${escapeHtml(currentTrip.destinationName || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Address</span><span class="summary-value">${escapeHtml(currentTrip.destinationAddress || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Date</span><span class="summary-value">${escapeHtml(currentTrip.tripDate || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Meet time</span><span class="summary-value">${escapeHtml(currentTrip.meetTime || "-")}</span></div>
        </div>

        <div class="card">
          <div class="card-title">Purpose</div>
          <ul style="margin-left:18px; color:#244b55;">
            ${pHtml}
          </ul>
        </div>

        <div class="card">
          <div class="card-title">Packing plan</div>
          <div class="summary-row"><span class="summary-label">Money needed</span><span class="summary-value">${escapeHtml(currentTrip.packing.moneyNeeded || "-")}</span></div>
          <div class="summary-row"><span class="summary-label">Safety rules</span><span class="summary-value">${escapeHtml((currentTrip.packing.safetyRules || "-").slice(0, 60))}</span></div>
          <div class="summary-row"><span class="summary-label">What to bring</span><span class="summary-value">${escapeHtml((currentTrip.packing.whatToBring || "-").slice(0, 60))}</span></div>
        </div>
      </div>

      <button class="btn-primary" type="button" id="btnSave">
        Save trip
      </button>

      <button class="btn-secondary" type="button" id="btnEdit">
        Edit steps
      </button>

      <button class="btn-secondary" type="button" id="btnPast">
        Past trips
      </button>
    </section>
  `);

  $("btnSave")?.addEventListener("click", studentSaveTrip);
  $("btnEdit")?.addEventListener("click", () => goTo("planDestination"));
  $("btnPast")?.addEventListener("click", () => goTo("studentPastTrips"));
}

async function renderStudentPastTrips() {
  if (!authUser || activeRole !== "student") {
    goTo("studentAuth");
    return;
  }

  studentEnrollment = await loadStudentEnrollment(authUser.uid);

  if (!studentEnrollment) {
    goTo("studentHome");
    return;
  }

  const trips = await studentLoadPastTrips();

  const tripsHtml = trips.length
    ? trips
        .map(t => {
          const trip = t.trip || {};
          const dest = escapeHtml(trip.destinationName || "-");
          const date = escapeHtml(trip.tripDate || "-");
          return `
            <div class="card">
              <div class="card-title">${dest}</div>
              <div class="muted">Date: ${date}</div>
            </div>
          `;
        })
        .join("")
    : `<div class="card"><div class="muted">No trips saved yet.</div></div>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="pastTitle">
      <h2 id="pastTitle">Past trips</h2>
      <p>Your saved trip plans show here.</p>

      ${tripsHtml}

      <button class="btn-primary" type="button" id="btnNew">
        Start a new trip
      </button>

      <button class="btn-secondary" type="button" id="btnBack">
        Back
      </button>
    </section>
  `);

  $("btnNew")?.addEventListener("click", () => goTo("planDestination"));
  $("btnBack")?.addEventListener("click", () => goTo("studentHome"));
}

/* =========================================================
   SIDEBAR WIRING
   Keep it safe based on role
   ========================================================= */

function wireSidebar() {
  document.querySelectorAll(".sidebar-item").forEach(btn => {
    btn.addEventListener("click", async () => {
      const target = btn.getAttribute("data-screen");
      if (!target) return;

      // Teacher screens
      if (target.startsWith("teacher")) {
        if (!authUser || activeRole !== "teacher") {
          goTo("teacherAuth");
          return;
        }
      }

      // Student screens
      if (
        target === "studentHome" ||
        target === "planDestination" ||
        target === "mapsInstructions" ||
        target === "routeDetails" ||
        target === "summary" ||
        target === "studentPastTrips"
      ) {
        if (!authUser || activeRole !== "student") {
          goTo("studentAuth");
          return;
        }
      }

      goTo(target);
    });
  });
}

/* =========================================================
   AUTH STATE LISTENER
   Decide where to send user after login
   ========================================================= */

onAuthStateChanged(auth, async user => {
  authUser = user || null;

  // Not signed in
  if (!authUser) {
    render();
    highlightSidebar();
    return;
  }

  // Signed in
  if (activeRole === "teacher") {
    try {
      await ensureTeacherProfile(authUser);
      goTo("teacherClasses");
      return;
    } catch (err) {
      console.error(err);
      goTo("teacherAuth");
      return;
    }
  }

  if (activeRole === "student") {
    try {
      studentEnrollment = await loadStudentEnrollment(authUser.uid);
      goTo("studentHome");
      return;
    } catch (err) {
      console.error(err);
      goTo("studentAuth");
      return;
    }
  }

  // If role is unknown, send to landing
  goTo("landing");
});

/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  wireSidebar();
  render();
  highlightSidebar();
});
