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
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', "\"")
    .replaceAll("'", "'");
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

  const url = `https://www.google.com/maps/dir/?api=1&origin=$?saddr=${encodeURIComponent(
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

  const emailLower = emailRaw.toLowerCase().trim();
  if (!emailLower) {
    setError("rosterError", "Student email is required.");
    return;
  }
  if (!emailLower.includes("@")) {
    setError("rosterError", "Enter a valid email address.");
    return;
  }

  // Use the email as the roster doc id (lowercased)
  const rosterDocId = emailLower;

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
        email: rosterDocId, // stored lowercase for matching
        name: nameRaw || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

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
  if (currentScreen ===
