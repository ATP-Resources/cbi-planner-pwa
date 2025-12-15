/* =========================================================
   CBI TRIP PLANNER APP
   Firebase Auth + Firestore
   Teacher classes + roster + student auto-assign
   Student trip planning steps + save trips to:
     /students/{uid}/trips/{tripId}
   ========================================================= */

/* =========================================================
   FIREBASE IMPORTS (MODULAR SDK)
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

/* ---------- Teacher state ---------- */

let teacherClasses = [];
let unsubscribeClasses = null;

let selectedClassId = null;
let selectedClassMeta = null;

let rosterList = [];
let unsubscribeRoster = null;

let rosterStatusMap = {}; // emailLower -> status info

let selectedStudent = null; // { uid, email, name }
let studentTripsForTeacher = [];
let unsubscribeTeacherStudentTrips = null;

let selectedTripForTeacher = null;

/* ---------- Student state ---------- */

let studentProfile = null;

// Current trip object the student is editing
let currentTrip = buildEmptyTrip();

// Track whether student is editing an existing saved trip
let currentTripMeta = {
  id: null, // Firestore tripId if editing
  loadedFromFirestore: false
};

// Realtime list of the signed-in student's trips
let studentTrips = [];
let unsubscribeStudentTrips = null;

// When student opens a trip from past trips
let selectedTripForStudent = null;

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
  const root = $("app");
  if (!root) return;
  root.innerHTML = html;
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
   TRIP DATA MODEL
   ========================================================= */

function buildEmptyTrip() {
  return {
    // Step 1
    destinationName: "",
    destinationAddress: "",
    tripDate: "",
    meetTime: "",

    // Step 3 route there
    routeThere: {
      busNumber: "",
      direction: "",
      boardStop: "",
      exitStop: "",
      departTime: "",
      arriveTime: "",
      totalTime: ""
    },

    // Step 3 route back
    routeBack: {
      busNumber: "",
      direction: "",
      boardStop: "",
      exitStop: "",
      departTime: "",
      arriveTime: "",
      totalTime: ""
    },

    // Step 4 purpose
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

    // Optional weather planning notes (student decides)
    weather: {
      city: "",
      notes: ""
    }
  };
}

function clearCurrentTrip() {
  currentTrip = buildEmptyTrip();
  currentTripMeta = { id: null, loadedFromFirestore: false };
}

/* =========================================================
   STUDENT TRIP FIELD UPDATERS
   ========================================================= */

function updateTripField(field, value) {
  currentTrip[field] = value;
}

function updateRouteThereField(field, value) {
  currentTrip.routeThere[field] = value;
}

function updateRouteBackField(field, value) {
  currentTrip.routeBack[field] = value;
}

function togglePurposeField(field, checked) {
  currentTrip.purpose[field] = checked;
}

function updatePurposeOther(value) {
  currentTrip.purpose.otherText = value;
}

function updateWeatherField(field, value) {
  currentTrip.weather[field] = value;
}

/* =========================================================
   GOOGLE MAPS
   ========================================================= */

function openMapsForCurrentTrip() {
  const origin = "Katella High School, Anaheim, CA";
  const destination = `${currentTrip.destinationName} ${currentTrip.destinationAddress}`.trim();

  if (!destination) {
    alert("Please enter a destination name and address first.");
    return;
  }

  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin
  )}&destination=${encodeURIComponent(destination)}&travelmode=transit`;

  window.open(url, "_blank");
}

/* =========================================================
   PURPOSE SUMMARY BUILDER
   ========================================================= */

function renderPurposeSummaryList() {
  const p = currentTrip.purpose;
  const items = [];

  if (p.lifeSkills) items.push("Life skills (shopping, ordering, daily living)");
  if (p.communityAccess) items.push("Community access and navigation");
  if (p.moneySkills) items.push("Money skills (budgeting, paying, change)");
  if (p.communication) items.push("Communication and self advocacy");
  if (p.socialSkills) items.push("Social skills and teamwork");
  if (p.employmentPrep) items.push("Employment preparation or work skills");
  if (p.recreationLeisure) items.push("Recreation and leisure in the community");
  if (p.safetySkills) items.push("Safety skills (street safety, stranger awareness, etc.)");

  if (String(p.otherText || "").trim() !== "") items.push(`Other: ${String(p.otherText).trim()}`);

  if (!items.length) return "<li>No purposes selected yet.</li>";
  return items.map(t => `<li>${escapeHtml(t)}</li>`).join("");
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

  // Already assigned
  if (profile?.teacherId && profile?.classId) return profile;

  // Try auto-assign based on roster email match
  const emailLower = String(user.email || "").toLowerCase().trim();
  if (!emailLower) return profile;

  const rosterQ = query(
    collectionGroup(db, "roster"),
    where("email", "==", emailLower),
    limit(1)
  );

  const rosterSnap = await getDocs(rosterQ);
  if (rosterSnap.empty) return profile;

  const rosterDoc = rosterSnap.docs[0];
  const parts = rosterDoc.ref.path.split("/");
  // teachers/{teacherId}/classes/{classId}/roster/{rosterId}
  const teacherId = parts[1];
  const classId = parts[3];

  await setDoc(studentRef, { teacherId, classId, assignedAt: serverTimestamp() }, { merge: true });

  profileSnap = await getDoc(studentRef);
  profile = profileSnap.exists() ? profileSnap.data() : profile;

  return profile;
}

/* =========================================================
   SIGN OUT AND CLEANUP
   ========================================================= */

function cleanupTeacherRealtime() {
  if (unsubscribeClasses) {
    unsubscribeClasses();
    unsubscribeClasses = null;
  }
  teacherClasses = [];
}

function cleanupRosterRealtime() {
  if (unsubscribeRoster) {
    unsubscribeRoster();
    unsubscribeRoster = null;
  }
  rosterList = [];
  rosterStatusMap = {};
}

function cleanupTeacherStudentTripsRealtime() {
  if (unsubscribeTeacherStudentTrips) {
    unsubscribeTeacherStudentTrips();
    unsubscribeTeacherStudentTrips = null;
  }
  studentTripsForTeacher = [];
  selectedStudent = null;
  selectedTripForTeacher = null;
}

function cleanupStudentTripsRealtime() {
  if (unsubscribeStudentTrips) {
    unsubscribeStudentTrips();
    unsubscribeStudentTrips = null;
  }
  studentTrips = [];
  selectedTripForStudent = null;
}

async function appSignOut() {
  try {
    await signOut(auth);

    cleanupTeacherRealtime();
    cleanupRosterRealtime();
    cleanupTeacherStudentTripsRealtime();
    cleanupStudentTripsRealtime();

    studentProfile = null;
    selectedClassId = null;
    selectedClassMeta = null;

    clearCurrentTrip();

    goTo("landing");
  } catch (err) {
    console.error(err);
    alert("Sign out failed. Try again.");
  }
}

/* =========================================================
   FIRESTORE: TEACHER CLASSES
   ========================================================= */

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
        setError("classesError", err?.message || "Could not load classes. Check rules.");
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
   ========================================================= */

function startRosterRealtime(teacherUid, classId) {
  cleanupRosterRealtime();
  if (!teacherUid || !classId) return;

  const rosterRef = collection(db, "teachers", teacherUid, "classes", classId, "roster");
  const q = query(rosterRef, orderBy("createdAt", "desc"));

  unsubscribeRoster = onSnapshot(
    q,
    snapshot => {
      rosterList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      refreshRosterAssignmentStatuses().then(() => {
        if (currentScreen === "classRoster") renderClassRosterScreen();
      });
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

  selectedClassId = classId;
  selectedClassMeta = teacherClasses.find(c => c.id === classId) || null;

  startRosterRealtime(authUser.uid, classId);
  goTo("classRoster");
}

async function addStudentToRoster() {
  setError("rosterError", "");
  if (!authUser || !selectedClassId) return;

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
    const rosterDocRef = doc(
  db,
  "teachers",
  authUser.uid,
  "classes",
  selectedClassId,
  "roster",
  rosterDocId
);

await setDoc(
  rosterDocRef,
  {
    email: rosterDocId,
    name: nameRaw,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  },
  { merge: true }

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
   ROSTER STATUS LOOKUP
   ========================================================= */

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function refreshRosterAssignmentStatuses() {
  rosterStatusMap = {};
  if (!authUser || !selectedClassId) return;

  const emails = rosterList
    .map(r => String(r.email || "").toLowerCase().trim())
    .filter(Boolean);

  if (!emails.length) return;

  const chunks = chunkArray([...new Set(emails)], 10);

  for (const chunk of chunks) {
    try {
      const qStudents = query(collection(db, "students"), where("email", "in", chunk));
      const snap = await getDocs(qStudents);

      snap.docs.forEach(d => {
        const data = d.data() || {};
        const email = String(data.email || "").toLowerCase().trim();
        if (!email) return;

        const teacherId = data.teacherId || null;
        const classId = data.classId || null;

        const assignedToThisClass = teacherId === authUser.uid && classId === selectedClassId;
        const assignedElsewhere = !!(teacherId && classId) && !assignedToThisClass;

        rosterStatusMap[email] = {
          found: true,
          studentUid: d.id,
          teacherId,
          classId,
          assignedToThisClass,
          assignedElsewhere
        };
      });

      chunk.forEach(email => {
        if (!rosterStatusMap[email]) {
          rosterStatusMap[email] = {
            found: false,
            studentUid: null,
            teacherId: null,
            classId: null,
            assignedToThisClass: false,
            assignedElsewhere: false
          };
        }
      });
    } catch (err) {
      console.error("Roster status lookup failed:", err);
      chunk.forEach(email => {
        if (!rosterStatusMap[email]) {
          rosterStatusMap[email] = {
            found: false,
            studentUid: null,
            teacherId: null,
            classId: null,
            assignedToThisClass: false,
            assignedElsewhere: false
          };
        }
      });
    }
  }
}

/* =========================================================
   TEACHER: VIEW STUDENT TRIPS (READ ONLY)
   ========================================================= */

function openTeacherStudentTrips(studentUid, email, name) {
  if (!authUser) return goTo("teacherAuth");
  if (!studentUid) return;

  cleanupTeacherStudentTripsRealtime();

  selectedStudent = { uid: studentUid, email: email || "", name: name || "" };

  const tripsRef = collection(db, "students", studentUid, "trips");
  const qTrips = query(tripsRef, orderBy("createdAt", "desc"));

  unsubscribeTeacherStudentTrips = onSnapshot(
    qTrips,
    snap => {
      studentTripsForTeacher = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "teacherStudentTrips") renderTeacherStudentTripsScreen();
    },
    err => {
      console.error(err);
      if (currentScreen === "teacherStudentTrips") {
        setError("tripsError", err?.message || "Could not load trips. Check rules.");
      }
    }
  );

  goTo("teacherStudentTrips");
}

function openTeacherTripDetails(tripId) {
  const found = studentTripsForTeacher.find(t => t.id === tripId) || null;
  selectedTripForTeacher = found;
  goTo("teacherTripDetails");
}

/* =========================================================
   STUDENT: TRIPS REALTIME + SAVE
   ========================================================= */

function startStudentTripsRealtime(studentUid) {
  cleanupStudentTripsRealtime();
  if (!studentUid) return;

  const tripsRef = collection(db, "students", studentUid, "trips");
  const qTrips = query(tripsRef, orderBy("createdAt", "desc"));

  unsubscribeStudentTrips = onSnapshot(
    qTrips,
    snap => {
      studentTrips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "studentPastTrips") renderStudentPastTripsScreen();
    },
    err => {
      console.error(err);
      if (currentScreen === "studentPastTrips") {
        setError("studentTripsError", err?.message || "Could not load your trips.");
      }
    }
  );
}

function buildTripPayloadForSave() {
  return {
    destinationName: currentTrip.destinationName || "",
    destinationAddress: currentTrip.destinationAddress || "",
    tripDate: currentTrip.tripDate || "",
    meetTime: currentTrip.meetTime || "",

    routeThere: { ...currentTrip.routeThere },
    routeBack: { ...currentTrip.routeBack },
    purpose: { ...currentTrip.purpose },
    weather: { ...currentTrip.weather },

    updatedAt: serverTimestamp()
  };
}

async function saveStudentTrip() {
  if (!authUser) {
    alert("Please sign in first.");
    return;
  }

  setError("studentSaveError", "");

  try {
    const payload = buildTripPayloadForSave();
    const tripsRef = collection(db, "students", authUser.uid, "trips");

    // If this trip was loaded from Firestore, update it
    if (currentTripMeta.id) {
      const tripRef = doc(db, "students", authUser.uid, "trips", currentTripMeta.id);
      await setDoc(
        tripRef,
        { ...payload, id: currentTripMeta.id },
        { merge: true }
      );
      alert("Trip updated and saved.");
      return;
    }

    // Otherwise create a new trip
    const docRef = await addDoc(tripsRef, {
      ...payload,
      createdAt: serverTimestamp()
    });

    currentTripMeta.id = docRef.id;
    currentTripMeta.loadedFromFirestore = true;

    alert("Trip saved.");
  } catch (err) {
    console.error(err);
    setError("studentSaveError", err?.message || "Could not save trip. Check rules.");
  }
}

function openStudentTripFromPast(tripId) {
  const found = studentTrips.find(t => t.id === tripId) || null;
  if (!found) return;

  // Load into currentTrip
  currentTrip = {
    destinationName: found.destinationName || "",
    destinationAddress: found.destinationAddress || "",
    tripDate: found.tripDate || "",
    meetTime: found.meetTime || "",
    routeThere: { ...(found.routeThere || buildEmptyTrip().routeThere) },
    routeBack: { ...(found.routeBack || buildEmptyTrip().routeBack) },
    purpose: { ...(found.purpose || buildEmptyTrip().purpose) },
    weather: { ...(found.weather || buildEmptyTrip().weather) }
  };

  currentTripMeta = { id: found.id, loadedFromFirestore: true };
  selectedTripForStudent = found;

  goTo("summary");
}

/* =========================================================
   SCREEN RENDERING
   ========================================================= */

function render() {
  if (currentScreen === "landing") return renderLandingScreen();

  if (currentScreen === "teacherAuth") return renderTeacherAuthScreen();
  if (currentScreen === "teacherClasses") return renderTeacherClassesScreen();
  if (currentScreen === "createClass") return renderCreateClassScreen();
  if (currentScreen === "classRoster") return renderClassRosterScreen();

  if (currentScreen === "studentAuth") return renderStudentAuthScreen();
  if (currentScreen === "studentHome") return renderStudentHomeScreen();
  if (currentScreen === "planDestination") return renderPlanDestinationScreen();
  if (currentScreen === "mapsInstructions") return renderMapsInstructionsScreen();
  if (currentScreen === "routeDetails") return renderRouteDetailsScreen();
  if (currentScreen === "summary") return renderSummaryScreen();
  if (currentScreen === "studentPastTrips") return renderStudentPastTripsScreen();

  if (currentScreen === "teacherStudentTrips") return renderTeacherStudentTripsScreen();
  if (currentScreen === "teacherTripDetails") return renderTeacherTripDetailsScreen();

  // Default
  return renderLandingScreen();
}

/* =========================================================
   LANDING
   ========================================================= */

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

/* =========================================================
   TEACHER AUTH
   ========================================================= */

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

/* =========================================================
   TEACHER CLASSES
   ========================================================= */

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

/* =========================================================
   TEACHER ROSTER
   ========================================================= */

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
          const emailRaw = String(s.email || "");
          const email = emailRaw.toLowerCase().trim();
          const emailSafe = escapeHtml(emailRaw);

          const status = rosterStatusMap[email];
          let badgeText = "Not assigned";
          let badgeStyle = "background:#e6e6e6; color:#333;";
          let subText = "Student has not logged in yet, or email does not match a student profile.";

          if (status?.found && status.assignedToThisClass) {
            badgeText = "Assigned";
            badgeStyle = "background:#1AA489; color:#fff;";
            subText = "Student profile is assigned to this class.";
          } else if (status?.found && status.assignedElsewhere) {
            badgeText = "Assigned elsewhere";
            badgeStyle = "background:#f2c94c; color:#333;";
            subText = "Student is assigned to a different class.";
          } else if (status?.found && !status.assignedElsewhere) {
            badgeText = "Profile found";
            badgeStyle = "background:#dbeafe; color:#1e40af;";
            subText = "Student profile exists, but is not assigned to a class yet.";
          }

          const viewTripsBtn =
            status?.found && status?.studentUid && status.assignedToThisClass
              ? `<button class="btn-primary" type="button" data-viewtrips="${escapeHtml(status.studentUid)}" data-email="${emailSafe}" data-name="${name}">
                   View trips
                 </button>`
              : "";

          const showName = name ? `<div><strong>${name}</strong></div>` : "";

          return `
            <div class="summary-card" style="margin-bottom:12px;">
              <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
                <div>
                  ${showName}
                  <div class="small-note">${emailSafe}</div>
                  <div class="small-note" style="margin-top:6px;">${escapeHtml(subText)}</div>
                </div>

                <div style="flex-shrink:0;">
                  <span style="display:inline-block; padding:6px 10px; border-radius:999px; font-size:12px; ${badgeStyle}">
                    ${escapeHtml(badgeText)}
                  </span>
                </div>
              </div>

              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                ${viewTripsBtn}
                <button class="btn-secondary" type="button" data-remove="${escapeHtml(s.id)}">Remove</button>
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
        <input id="rosterName" type="text" placeholder="Example: Student name" autocomplete="off" />

        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
          <button class="btn-primary" type="button" id="btnAddStudent">Add to roster</button>
          <button class="btn-secondary" type="button" id="btnRefreshStatus">Refresh status</button>
          <button class="btn-secondary" type="button" id="btnBackClasses">Back to classes</button>
        </div>

        <p id="rosterError" style="color:#b00020; margin-top:10px;"></p>

        <p class="small-note" style="margin-top:10px;">
          Assigned means: the student logged in AND their student profile points to this class.
        </p>
      </div>

      <div style="margin-top:16px;">
        <h3 style="margin-bottom:10px;">Roster</h3>
        ${rosterHtml}
      </div>
    </section>
  `);

  $("btnAddStudent")?.addEventListener("click", addStudentToRoster);

  $("btnRefreshStatus")?.addEventListener("click", async () => {
    setError("rosterError", "");
    await refreshRosterAssignmentStatuses();
    renderClassRosterScreen();
  });

  $("btnBackClasses")?.addEventListener("click", () => {
    cleanupRosterRealtime();
    cleanupTeacherStudentTripsRealtime();

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

  document.querySelectorAll("[data-viewtrips]").forEach(btn => {
    btn.addEventListener("click", () => {
      const uid = btn.getAttribute("data-viewtrips");
      const email = btn.getAttribute("data-email") || "";
      const name = btn.getAttribute("data-name") || "";
      if (uid) openTeacherStudentTrips(uid, email, name);
    });
  });
}

/* =========================================================
   STUDENT AUTH + HOME
   ========================================================= */

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
              <h4 style="margin-top:0;">Ready to plan</h4>
              <p class="small-note">
                You will use Google Maps and type your route details yourself.
              </p>

              <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px;">
                <button class="btn-primary" type="button" id="btnStartTrip">Start a new trip</button>
                <button class="btn-secondary" type="button" id="btnPastTrips">Past trips</button>
              </div>
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

  if (assigned) {
    $("btnStartTrip")?.addEventListener("click", () => {
      clearCurrentTrip();
      goTo("planDestination");
    });

    $("btnPastTrips")?.addEventListener("click", () => goTo("studentPastTrips"));
  }
}

/* =========================================================
   STUDENT STEP 1
   ========================================================= */

function renderPlanDestinationScreen() {
  if (!authUser) return goTo("studentAuth");

  setAppHtml(`
    <section class="screen" aria-labelledby="step1Title">
      <h2 id="step1Title">Step 1 - Basic info</h2>
      <p>Enter the basic information for your CBI trip.</p>

      <label for="destName">Destination name</label>
      <input
        id="destName"
        type="text"
        autocomplete="off"
        placeholder="Example: Target"
        value="${escapeHtml(currentTrip.destinationName)}"
      />

      <label for="destAddress">Destination address</label>
      <input
        id="destAddress"
        type="text"
        autocomplete="off"
        placeholder="Street and city"
        value="${escapeHtml(currentTrip.destinationAddress)}"
      />

      <label for="tripDate">Date of trip</label>
      <input
        id="tripDate"
        type="date"
        value="${escapeHtml(currentTrip.tripDate)}"
      />

      <label for="meetTime">Meet time</label>
      <input
        id="meetTime"
        type="time"
        value="${escapeHtml(currentTrip.meetTime)}"
      />

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <button class="btn-primary" type="button" id="btnToStep2">Go to Step 2</button>
        <button class="btn-secondary" type="button" id="btnClearTrip">Clear trip</button>
        <button class="btn-secondary" type="button" id="btnBackStudentHome">Back</button>
      </div>
    </section>
  `);

  $("destName")?.addEventListener("input", e => updateTripField("destinationName", e.target.value));
  $("destAddress")?.addEventListener("input", e => updateTripField("destinationAddress", e.target.value));
  $("tripDate")?.addEventListener("input", e => updateTripField("tripDate", e.target.value));
  $("meetTime")?.addEventListener("input", e => updateTripField("meetTime", e.target.value));

  $("btnToStep2")?.addEventListener("click", () => goTo("mapsInstructions"));

  $("btnClearTrip")?.addEventListener("click", () => {
    const ok = confirm("Clear this trip? This will erase your current entries.");
    if (!ok) return;
    clearCurrentTrip();
    renderPlanDestinationScreen();
  });

  $("btnBackStudentHome")?.addEventListener("click", () => goTo("studentHome"));
}

/* =========================================================
   STUDENT STEP 2
   ========================================================= */

function renderMapsInstructionsScreen() {
  if (!authUser) return goTo("studentAuth");

  setAppHtml(`
    <section class="screen" aria-labelledby="step2Title">
      <h2 id="step2Title">Step 2 - Google Maps steps</h2>
      <p>Use Google Maps to find your route. You will type the details yourself in Step 3.</p>

      <ol class="step-list">
        <li>Check that your destination name and address are correct.</li>
        <li>Open Google Maps in transit mode.</li>
        <li>Choose a route that makes sense for you.</li>
        <li>Write down bus number, direction, stops, times, and total travel time.</li>
        <li>Come back here and type the details in Step 3.</li>
      </ol>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <button class="btn-primary" type="button" id="btnOpenMaps">Open Google Maps</button>
        <button class="btn-primary" type="button" id="btnToStep3">Go to Step 3</button>
        <button class="btn-secondary" type="button" id="btnBackStep1">Back to Step 1</button>
      </div>
    </section>
  `);

  $("btnOpenMaps")?.addEventListener("click", openMapsForCurrentTrip);
  $("btnToStep3")?.addEventListener("click", () => goTo("routeDetails"));
  $("btnBackStep1")?.addEventListener("click", () => goTo("planDestination"));
}

/* =========================================================
   STUDENT STEP 3 AND 4
   ========================================================= */

function renderRouteDetailsScreen() {
  if (!authUser) return goTo("studentAuth");

  const r = currentTrip.routeThere;
  const rb = currentTrip.routeBack;
  const p = currentTrip.purpose;

  setAppHtml(`
    <section class="screen" aria-labelledby="step3Title">
      <h2 id="step3Title">Step 3 - Route details</h2>
      <p>Type the route information from Google Maps. The app does not fill this in for you.</p>

      <h3 class="section-title">Route there</h3>

      <label for="busNumber">Bus number</label>
      <input id="busNumber" type="text" placeholder="Example: 57" value="${escapeHtml(r.busNumber)}" />

      <label for="direction">Direction</label>
      <input id="direction" type="text" placeholder="Example: Northbound" value="${escapeHtml(r.direction)}" />

      <label for="boardStop">Stop where you get on</label>
      <input id="boardStop" type="text" placeholder="Example: Katella and State College" value="${escapeHtml(r.boardStop)}" />

      <label for="exitStop">Stop where you get off</label>
      <input id="exitStop" type="text" placeholder="Example: Anaheim Blvd and Lincoln" value="${escapeHtml(r.exitStop)}" />

      <label for="departTime">Departure time</label>
      <input id="departTime" type="text" placeholder="Example: 9:05 AM" value="${escapeHtml(r.departTime)}" />

      <label for="arriveTime">Arrival time</label>
      <input id="arriveTime" type="text" placeholder="Example: 9:40 AM" value="${escapeHtml(r.arriveTime)}" />

      <label for="totalTime">Total travel time</label>
      <input id="totalTime" type="text" placeholder="Example: 35 minutes" value="${escapeHtml(r.totalTime)}" />

      <h3 class="section-title" style="margin-top:24px;">Route back</h3>

      <label for="busNumberBack">Bus number</label>
      <input id="busNumberBack" type="text" placeholder="Example: 57" value="${escapeHtml(rb.busNumber)}" />

      <label for="directionBack">Direction</label>
      <input id="directionBack" type="text" placeholder="Example: Southbound" value="${escapeHtml(rb.direction)}" />

      <label for="boardStopBack">Stop where you get on</label>
      <input id="boardStopBack" type="text" placeholder="Example: Lincoln and Anaheim Blvd" value="${escapeHtml(rb.boardStop)}" />

      <label for="exitStopBack">Stop where you get off</label>
      <input id="exitStopBack" type="text" placeholder="Example: Katella and State College" value="${escapeHtml(rb.exitStop)}" />

      <label for="departTimeBack">Departure time</label>
      <input id="departTimeBack" type="text" placeholder="Example: 12:30 PM" value="${escapeHtml(rb.departTime)}" />

      <label for="arriveTimeBack">Arrival time</label>
      <input id="arriveTimeBack" type="text" placeholder="Example: 1:05 PM" value="${escapeHtml(rb.arriveTime)}" />

      <label for="totalTimeBack">Total travel time</label>
      <input id="totalTimeBack" type="text" placeholder="Example: 35 minutes" value="${escapeHtml(rb.totalTime)}" />

      <h3 class="section-title" style="margin-top:24px;">Step 4 - Why are we going?</h3>
      <p>Check all the skills you will practice on this trip.</p>

      <div class="purpose-grid">
        ${renderPurposeCheckbox("lifeSkills", p.lifeSkills, "Life skills (shopping, ordering, daily living)")}
        ${renderPurposeCheckbox("communityAccess", p.communityAccess, "Community access and navigation")}
        ${renderPurposeCheckbox("moneySkills", p.moneySkills, "Money skills (budgeting, paying, change)")}
        ${renderPurposeCheckbox("communication", p.communication, "Communication and self advocacy")}
        ${renderPurposeCheckbox("socialSkills", p.socialSkills, "Social skills and teamwork")}
        ${renderPurposeCheckbox("employmentPrep", p.employmentPrep, "Employment preparation or work skills")}
        ${renderPurposeCheckbox("recreationLeisure", p.recreationLeisure, "Recreation and leisure in the community")}
        ${renderPurposeCheckbox("safetySkills", p.safetySkills, "Safety skills (street safety, stranger awareness, etc.)")}
      </div>

      <label for="purposeOther">Other reason</label>
      <input
        id="purposeOther"
        type="text"
        placeholder="Example: practice transfers"
        value="${escapeHtml(p.otherText)}"
      />

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <button class="btn-primary" type="button" id="btnToSummary">Go to summary</button>
        <button class="btn-secondary" type="button" id="btnBackStep2">Back to Step 2</button>
      </div>
    </section>
  `);

  // Route there
  $("busNumber")?.addEventListener("input", e => updateRouteThereField("busNumber", e.target.value));
  $("direction")?.addEventListener("input", e => updateRouteThereField("direction", e.target.value));
  $("boardStop")?.addEventListener("input", e => updateRouteThereField("boardStop", e.target.value));
  $("exitStop")?.addEventListener("input", e => updateRouteThereField("exitStop", e.target.value));
  $("departTime")?.addEventListener("input", e => updateRouteThereField("departTime", e.target.value));
  $("arriveTime")?.addEventListener("input", e => updateRouteThereField("arriveTime", e.target.value));
  $("totalTime")?.addEventListener("input", e => updateRouteThereField("totalTime", e.target.value));

  // Route back
  $("busNumberBack")?.addEventListener("input", e => updateRouteBackField("busNumber", e.target.value));
  $("directionBack")?.addEventListener("input", e => updateRouteBackField("direction", e.target.value));
  $("boardStopBack")?.addEventListener("input", e => updateRouteBackField("boardStop", e.target.value));
  $("exitStopBack")?.addEventListener("input", e => updateRouteBackField("exitStop", e.target.value));
  $("departTimeBack")?.addEventListener("input", e => updateRouteBackField("departTime", e.target.value));
  $("arriveTimeBack")?.addEventListener("input", e => updateRouteBackField("arriveTime", e.target.value));
  $("totalTimeBack")?.addEventListener("input", e => updateRouteBackField("totalTime", e.target.value));

  // Purpose
  document.querySelectorAll("[data-purpose]").forEach(cb => {
    cb.addEventListener("change", e => {
      const field = cb.getAttribute("data-purpose");
      if (!field) return;
      togglePurposeField(field, !!e.target.checked);
    });
  });

  $("purposeOther")?.addEventListener("input", e => updatePurposeOther(e.target.value));

  $("btnToSummary")?.addEventListener("click", () => goTo("summary"));
  $("btnBackStep2")?.addEventListener("click", () => goTo("mapsInstructions"));
}

function renderPurposeCheckbox(field, checked, labelText) {
  return `
    <label class="purpose-item">
      <input type="checkbox" data-purpose="${escapeHtml(field)}" ${checked ? "checked" : ""} />
      ${escapeHtml(labelText)}
    </label>
  `;
}

/* =========================================================
   STUDENT SUMMARY + SAVE
   ========================================================= */

function renderSummaryScreen() {
  if (!authUser) return goTo("studentAuth");

  const r = currentTrip.routeThere;
  const rb = currentTrip.routeBack;
  const pHtml = renderPurposeSummaryList();

  const savedTag = currentTripMeta.id ? `<span class="small-note">Saved trip ID: ${escapeHtml(currentTripMeta.id)}</span>` : "";

  setAppHtml(`
    <section class="screen" aria-labelledby="summaryTitle">
      <h2 id="summaryTitle">Trip summary</h2>
      <p>Review your plan. If something looks wrong, go back and fix it.</p>
      ${savedTag}

      <div class="summary-grid">
        <article class="summary-card">
          <h4>Trip basics</h4>
          <div class="summary-row">
            <span class="summary-label">Destination:</span>
            <span class="summary-value">${escapeHtml(currentTrip.destinationName || "-")}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Address:</span>
            <span class="summary-value">${escapeHtml(currentTrip.destinationAddress || "-")}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Date:</span>
            <span class="summary-value">${escapeHtml(currentTrip.tripDate || "-")}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Meet time:</span>
            <span class="summary-value">${escapeHtml(currentTrip.meetTime || "-")}</span>
          </div>
        </article>

        <article class="summary-card">
          <h4>Route there</h4>
          ${renderSummaryRow("Bus number", r.busNumber)}
          ${renderSummaryRow("Direction", r.direction)}
          ${renderSummaryRow("Get on", r.boardStop)}
          ${renderSummaryRow("Get off", r.exitStop)}
          ${renderSummaryRow("Depart", r.departTime)}
          ${renderSummaryRow("Arrive", r.arriveTime)}
          ${renderSummaryRow("Total time", r.totalTime)}
        </article>

        <article class="summary-card">
          <h4>Route back</h4>
          ${renderSummaryRow("Bus number", rb.busNumber)}
          ${renderSummaryRow("Direction", rb.direction)}
          ${renderSummaryRow("Get on", rb.boardStop)}
          ${renderSummaryRow("Get off", rb.exitStop)}
          ${renderSummaryRow("Depart", rb.departTime)}
          ${renderSummaryRow("Arrive", rb.arriveTime)}
          ${renderSummaryRow("Total time", rb.totalTime)}
        </article>

        <article class="summary-card">
          <h4>Why are we going?</h4>
          <ul class="summary-list">${pHtml}</ul>
        </article>
      </div>

      <div style="margin-top:14px;">
        <p id="studentSaveError" style="color:#b00020;"></p>

        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button class="btn-primary" type="button" id="btnSaveTrip">
            Save trip
          </button>

          <button class="btn-secondary" type="button" id="btnEditStep1">
            Edit Step 1
          </button>

          <button class="btn-secondary" type="button" id="btnEditStep3">
            Edit Step 3 and 4
          </button>

          <button class="btn-secondary" type="button" id="btnPastTrips">
            Past trips
          </button>

          <button class="btn-secondary" type="button" id="btnStudentHome">
            Student home
          </button>
        </div>
      </div>
    </section>
  `);

  $("btnSaveTrip")?.addEventListener("click", saveStudentTrip);
  $("btnEditStep1")?.addEventListener("click", () => goTo("planDestination"));
  $("btnEditStep3")?.addEventListener("click", () => goTo("routeDetails"));
  $("btnPastTrips")?.addEventListener("click", () => goTo("studentPastTrips"));
  $("btnStudentHome")?.addEventListener("click", () => goTo("studentHome"));
}

function renderSummaryRow(label, value) {
  const v = value ? escapeHtml(value) : "-";
  return `
    <div class="summary-row">
      <span class="summary-label">${escapeHtml(label)}:</span>
      <span class="summary-value">${v}</span>
    </div>
  `;
}

/* =========================================================
   STUDENT PAST TRIPS
   ========================================================= */

function renderStudentPastTripsScreen() {
  if (!authUser) return goTo("studentAuth");

  const listHtml = studentTrips.length
    ? studentTrips
        .map(t => {
          const dest = escapeHtml(t.destinationName || "Trip");
          const date = escapeHtml(t.tripDate || "");
          const addr = escapeHtml(t.destinationAddress || "");
          const sub = date ? `Date: ${date}` : "No date entered";

          return `
            <div class="summary-card" style="margin-bottom:12px;">
              <h4 style="margin-top:0; margin-bottom:6px;">${dest}</h4>
              <div class="small-note">${escapeHtml(sub)}</div>
              ${addr ? `<div class="small-note">${addr}</div>` : ""}

              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <button class="btn-primary" type="button" data-open-student-trip="${escapeHtml(t.id)}">
                  Open
                </button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<p class="small-note">No saved trips yet.</p>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="pastTripsTitle">
      <h2 id="pastTripsTitle">Past trips</h2>
      <p>Open a saved trip to review or edit it.</p>

      <p id="studentTripsError" style="color:#b00020;"></p>

      <div style="margin-top:16px;">
        ${listHtml}
      </div>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <button class="btn-primary" type="button" id="btnStartNewTrip">Start new trip</button>
        <button class="btn-secondary" type="button" id="btnBackStudentHome">Back</button>
      </div>
    </section>
  `);

  document.querySelectorAll("[data-open-student-trip]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-student-trip");
      if (id) openStudentTripFromPast(id);
    });
  });

  $("btnStartNewTrip")?.addEventListener("click", () => {
    clearCurrentTrip();
    goTo("planDestination");
  });

  $("btnBackStudentHome")?.addEventListener("click", () => goTo("studentHome"));
}

/* =========================================================
   TEACHER: STUDENT TRIPS SCREENS
   ========================================================= */

function renderTeacherStudentTripsScreen() {
  if (!authUser) return goTo("teacherAuth");
  if (!selectedStudent?.uid) return goTo("classRoster");

  const titleName = selectedStudent.name ? escapeHtml(selectedStudent.name) : "Student";
  const titleEmail = escapeHtml(selectedStudent.email || "");

  const tripsHtml = studentTripsForTeacher.length
    ? studentTripsForTeacher
        .map(t => {
          const destName = escapeHtml(t.destinationName || "Trip");
          const tripDate = escapeHtml(t.tripDate || "");
          const when = tripDate ? `<div class="small-note">Date: ${tripDate}</div>` : "";

          return `
            <div class="summary-card" style="margin-bottom:12px;">
              <h4 style="margin-top:0; margin-bottom:6px;">${destName}</h4>
              ${when}
              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <button class="btn-primary" type="button" data-open-trip="${escapeHtml(t.id)}">Open trip</button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<p class="small-note">No trips saved yet for this student.</p>`;

  setAppHtml(`
    <section class="screen" aria-labelledby="tripsTitle">
      <h2 id="tripsTitle">Student trips</h2>

      <div class="summary-card" style="margin-top:12px;">
        <div class="summary-row">
          <span class="summary-label">Student:</span>
          <span class="summary-value">${titleName}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Email:</span>
          <span class="summary-value">${titleEmail}</span>
        </div>
      </div>

      <p id="tripsError" style="color:#b00020; margin-top:10px;"></p>

      <div style="margin-top:16px;">
        ${tripsHtml}
      </div>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <button class="btn-secondary" type="button" id="btnBackRoster">Back to roster</button>
      </div>
    </section>
  `);

  $("btnBackRoster")?.addEventListener("click", () => {
    selectedTripForTeacher = null;
    goTo("classRoster");
  });

  document.querySelectorAll("[data-open-trip]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-trip");
      if (id) openTeacherTripDetails(id);
    });
  });
}

function renderTeacherTripDetailsScreen() {
  if (!authUser) return goTo("teacherAuth");
  if (!selectedStudent?.uid) return goTo("classRoster");
  if (!selectedTripForTeacher?.id) return goTo("teacherStudentTrips");

  const tripJson = escapeHtml(JSON.stringify(selectedTripForTeacher, null, 2));

  const destName = escapeHtml(selectedTripForTeacher.destinationName || "Trip");
  const address = escapeHtml(selectedTripForTeacher.destinationAddress || "");
  const date = escapeHtml(selectedTripForTeacher.tripDate || "");
  const meet = escapeHtml(selectedTripForTeacher.meetTime || "");

  setAppHtml(`
    <section class="screen" aria-labelledby="tripTitle">
      <h2 id="tripTitle">Trip details</h2>

      <div class="summary-card" style="margin-top:12px;">
        <h4 style="margin-top:0;">${destName}</h4>
        ${address ? `<div class="small-note">${address}</div>` : ""}
        <div class="summary-row" style="margin-top:10px;">
          <span class="summary-label">Date:</span>
          <span class="summary-value">${date || "-"}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Meet time:</span>
          <span class="summary-value">${meet || "-"}</span>
        </div>
      </div>

      <div class="summary-card" style="margin-top:12px;">
        <h4 style="margin-top:0;">Raw trip data</h4>
        <pre style="white-space:pre-wrap; word-break:break-word; font-size:12px; line-height:1.4; margin:0;">${tripJson}</pre>
      </div>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px;">
        <button class="btn-secondary" type="button" id="btnBackTrips">Back to trips</button>
        <button class="btn-secondary" type="button" id="btnBackRoster">Back to roster</button>
      </div>
    </section>
  `);

  $("btnBackTrips")?.addEventListener("click", () => goTo("teacherStudentTrips"));
  $("btnBackRoster")?.addEventListener("click", () => goTo("classRoster"));
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

      // Guard teacher screens
      if (screen === "teacherClasses" || screen === "createClass") {
        if (!authUser) return goTo("teacherAuth");
      }

      // Guard student screens
      if (
        screen === "studentHome" ||
        screen === "planDestination" ||
        screen === "mapsInstructions" ||
        screen === "routeDetails" ||
        screen === "summary" ||
        screen === "studentPastTrips"
      ) {
        if (!authUser) return goTo("studentAuth");
      }

      // Internal screens should not be clickable from sidebar
      if (screen === "classRoster" || screen === "teacherStudentTrips" || screen === "teacherTripDetails") {
        return;
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
    cleanupTeacherStudentTripsRealtime();
    cleanupStudentTripsRealtime();

    studentProfile = null;
    selectedClassId = null;
    selectedClassMeta = null;

    clearCurrentTrip();

    if (currentScreen !== "landing") goTo("landing");
    else render();

    return;
  }

  try {
    // Teacher profile + classes
    await ensureTeacherProfile(authUser);
    startTeacherClassesRealtime(authUser.uid);

    // Student profile + auto-assign
    studentProfile = await ensureStudentProfileAndAutoAssign(authUser);

    // Student trips realtime (for past trips screen and for fast open)
    startStudentTripsRealtime(authUser.uid);

    // If they just did student login, land them
    if (currentScreen === "studentAuth") {
      goTo("studentHome");
      return;
    }

    // If they just did teacher login, land them
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
   INITIALIZE APP
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  render();
  wireSidebar();
  highlightSidebar("landing");
});

