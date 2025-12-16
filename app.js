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

  const url = `https://www.google.com/maps/dir/${encodeURIComponent(
    origin
  )}/${encodeURIComponent(destination)}/data=!4m2!4m1!3e3?hl=en&authuser=0&entry=ttu`;

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

  if (p.otherText) items.push(`Other: ${escapeHtml(p.otherText)}`);

  if (!items.length) {
    return `<p class="small-note">No purposes selected yet.</p>`;
  }

  return items.map(txt => `<li>${txt}</li>`).join("");
}

/* =========================================================
   AUTH STATE LISTENER
   ========================================================= */

onAuthStateChanged(auth, async user => {
  authUser = user;

  if (!user) {
    cleanupTeacherRealtime();
    cleanupRosterRealtime();
    cleanupTeacherStudentTripsRealtime();
    cleanupStudentTripsRealtime();

    studentProfile = null;
    selectedClassId = null;
    selectedClassMeta = null;
    clearCurrentTrip();

    if (currentScreen !== "landing" && currentScreen !== "teacherAuth" && currentScreen !== "studentAuth") {
      goTo("landing");
    } else {
      render();
    }
    return;
  }

  // Check if user is a student
  try {
    const studentDocRef = doc(db, "students", user.uid);
    const studentSnap = await getDoc(studentDocRef);

    if (studentSnap.exists()) {
      studentProfile = { uid: user.uid, ...studentSnap.data() };
      startStudentTripsRealtime(user.uid);
      
      if (currentScreen === "landing" || currentScreen === "studentAuth") {
        goTo("studentHome");
      } else {
        render();
      }
      return;
    }
  } catch (err) {
    console.error("Error checking student profile:", err);
  }

  // Check if user is a teacher
  try {
    const teacherDocRef = doc(db, "teachers", user.uid);
    const teacherSnap = await getDoc(teacherDocRef);

    if (teacherSnap.exists()) {
      startTeacherClassesRealtime(user.uid);
      
      if (currentScreen === "landing" || currentScreen === "teacherAuth") {
        goTo("teacherClasses");
      } else {
        render();
      }
      return;
    }
  } catch (err) {
    console.error("Error checking teacher profile:", err);
  }

  // User exists but has no role
  render();
});

/* =========================================================
   CLEANUP SUBSCRIPTIONS
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
      console.error("Error fetching student status:", err);
    }
  }
}

async function assignStudentToThisClass(email) {
  if (!authUser || !selectedClassId) return;

  const status = rosterStatusMap[email];
  if (!status || !status.found || !status.studentUid) {
    alert("Student account not found. They must sign in first.");
    return;
  }

  if (status.assignedElsewhere) {
    const ok = confirm("This student is already assigned to another class. Reassign to this class?");
    if (!ok) return;
  }

  try {
    const studentRef = doc(db, "students", status.studentUid);
    await updateDoc(studentRef, {
      teacherId: authUser.uid,
      classId: selectedClassId,
      updatedAt: serverTimestamp()
    });
    await refreshRosterAssignmentStatuses();
    if (currentScreen === "classRoster") renderClassRosterScreen();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not assign student.");
  }
}

async function unassignStudent(email) {
  if (!authUser || !selectedClassId) return;

  const status = rosterStatusMap[email];
  if (!status || !status.found || !status.studentUid) return;

  const ok = confirm("Unassign this student from your class?");
  if (!ok) return;

  try {
    const studentRef = doc(db, "students", status.studentUid);
    await updateDoc(studentRef, {
      teacherId: null,
      classId: null,
      updatedAt: serverTimestamp()
    });
    await refreshRosterAssignmentStatuses();
    if (currentScreen === "classRoster") renderClassRosterScreen();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not unassign student.");
  }
}

/* =========================================================
   TEACHER: VIEW STUDENT TRIPS
   ========================================================= */

function startTeacherStudentTripsRealtime(studentUid) {
  cleanupTeacherStudentTripsRealtime();
  if (!studentUid) return;

  const tripsRef = collection(db, "students", studentUid, "trips");
  const q = query(tripsRef, orderBy("createdAt", "desc"));

  unsubscribeTeacherStudentTrips = onSnapshot(
    q,
    snapshot => {
      studentTripsForTeacher = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "teacherStudentTrips") renderTeacherStudentTripsScreen();
    },
    err => {
      console.error(err);
      if (currentScreen === "teacherStudentTrips") {
        setError("teacherStudentTripsError", err?.message || "Could not load trips.");
      }
    }
  );
}

function openStudentTripsForTeacher(email) {
  const status = rosterStatusMap[email];
  if (!status || !status.found || !status.studentUid) {
    alert("Student account not found.");
    return;
  }

  const roster = rosterList.find(r => r.email === email);
  selectedStudent = {
    uid: status.studentUid,
    email: email,
    name: roster?.name || email
  };

  startTeacherStudentTripsRealtime(status.studentUid);
  goTo("teacherStudentTrips");
}

function openTripDetailsForTeacher(tripId) {
  const trip = studentTripsForTeacher.find(t => t.id === tripId);
  if (!trip) return;
  selectedTripForTeacher = trip;
  goTo("teacherTripDetail");
}

function backToStudentTrips() {
  selectedTripForTeacher = null;
  goTo("teacherStudentTrips");
}

function backToRoster() {
  cleanupTeacherStudentTripsRealtime();
  goTo("classRoster");
}

/* =========================================================
   STUDENT: TRIP CRUD
   ========================================================= */

function startStudentTripsRealtime(studentUid) {
  cleanupStudentTripsRealtime();
  if (!studentUid) return;

  const tripsRef = collection(db, "students", studentUid, "trips");
  const q = query(tripsRef, orderBy("createdAt", "desc"));

  unsubscribeStudentTrips = onSnapshot(
    q,
    snapshot => {
      studentTrips = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentScreen === "studentPastTrips") renderStudentPastTripsScreen();
    },
    err => {
      console.error(err);
      if (currentScreen === "studentPastTrips") {
        setError("pastTripsError", err?.message || "Could not load trips.");
      }
    }
  );
}

async function saveCurrentTrip() {
  if (!authUser || !studentProfile) {
    alert("You must be signed in as a student.");
    return;
  }

  try {
    const tripData = {
      ...currentTrip,
      updatedAt: serverTimestamp()
    };

    if (currentTripMeta.id) {
      // Update existing trip
      const tripRef = doc(db, "students", authUser.uid, "trips", currentTripMeta.id);
      await updateDoc(tripRef, tripData);
      alert("Trip updated successfully!");
    } else {
      // Create new trip
      tripData.createdAt = serverTimestamp();
      const tripsRef = collection(db, "students", authUser.uid, "trips");
      const docRef = await addDoc(tripsRef, tripData);
      currentTripMeta.id = docRef.id;
      currentTripMeta.loadedFromFirestore = true;
      alert("Trip saved successfully!");
    }
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not save trip.");
  }
}

async function deleteCurrentTrip() {
  if (!authUser || !currentTripMeta.id) return;

  const ok = confirm("Delete this trip?");
  if (!ok) return;

  try {
    const tripRef = doc(db, "students", authUser.uid, "trips", currentTripMeta.id);
    await deleteDoc(tripRef);
    clearCurrentTrip();
    goTo("studentPastTrips");
  } catch (err) {
    console.error(err);
    alert(err?.message || "Could not delete trip.");
  }
}

function startNewTrip() {
  clearCurrentTrip();
  goTo("studentHome");
}

function loadTripForEditing(tripId) {
  const trip = studentTrips.find(t => t.id === tripId);
  if (!trip) return;

  currentTrip = { ...trip };
  currentTripMeta = { id: tripId, loadedFromFirestore: true };
  goTo("summary");
}

function viewTripDetails(tripId) {
  const trip = studentTrips.find(t => t.id === tripId);
  if (!trip) return;
  selectedTripForStudent = trip;
  goTo("studentTripDetail");
}

function backToPastTrips() {
  selectedTripForStudent = null;
  goTo("studentPastTrips");
}

/* =========================================================
   AUTHENTICATION: TEACHER
   ========================================================= */

async function teacherSignInWithEmail() {
  setError("teacherAuthError", "");
  const email = ($("teacherEmail")?.value || "").trim();
  const password = ($("teacherPassword")?.value || "").trim();

  if (!email || !password) {
    setError("teacherAuthError", "Email and password are required.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error(err);
    setError("teacherAuthError", err?.message || "Sign in failed.");
  }
}

async function teacherSignUpWithEmail() {
  setError("teacherAuthError", "");
  const email = ($("teacherEmail")?.value || "").trim();
  const password = ($("teacherPassword")?.value || "").trim();
  const displayName = ($("teacherDisplayName")?.value || "").trim();

  if (!email || !password) {
    setError("teacherAuthError", "Email and password are required.");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (displayName) {
      await updateProfile(user, { displayName });
    }

    // Create teacher profile
    await setDoc(doc(db, "teachers", user.uid), {
      email: email.toLowerCase(),
      displayName: displayName || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    alert("Teacher account created successfully!");
  } catch (err) {
    console.error(err);
    setError("teacherAuthError", err?.message || "Sign up failed.");
  }
}

async function teacherSignInWithGoogle() {
  setError("teacherAuthError", "");
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Create or update teacher profile
    const teacherRef = doc(db, "teachers", user.uid);
    const teacherSnap = await getDoc(teacherRef);

    if (!teacherSnap.exists()) {
      await setDoc(teacherRef, {
        email: user.email?.toLowerCase() || "",
        displayName: user.displayName || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (err) {
    console.error(err);
    setError("teacherAuthError", err?.message || "Google sign in failed.");
  }
}

/* =========================================================
   AUTHENTICATION: STUDENT
   ========================================================= */

async function studentSignInWithEmail() {
  setError("studentAuthError", "");
  const email = ($("studentEmail")?.value || "").trim();
  const password = ($("studentPassword")?.value || "").trim();

  if (!email || !password) {
    setError("studentAuthError", "Email and password are required.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error(err);
    setError("studentAuthError", err?.message || "Sign in failed.");
  }
}

async function studentSignUpWithEmail() {
  setError("studentAuthError", "");
  const email = ($("studentEmail")?.value || "").trim();
  const password = ($("studentPassword")?.value || "").trim();
  const displayName = ($("studentDisplayName")?.value || "").trim();

  if (!email || !password) {
    setError("studentAuthError", "Email and password are required.");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (displayName) {
      await updateProfile(user, { displayName });
    }

    // Create student profile
    await setDoc(doc(db, "students", user.uid), {
      email: email.toLowerCase(),
      displayName: displayName || "",
      teacherId: null,
      classId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    alert("Student account created successfully!");
  } catch (err) {
    console.error(err);
    setError("studentAuthError", err?.message || "Sign up failed.");
  }
}

async function studentSignInWithGoogle() {
  setError("studentAuthError", "");
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Create or update student profile
    const studentRef = doc(db, "students", user.uid);
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) {
      await setDoc(studentRef, {
        email: user.email?.toLowerCase() || "",
        displayName: user.displayName || "",
        teacherId: null,
        classId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (err) {
    console.error(err);
    setError("studentAuthError", err?.message || "Google sign in failed.");
  }
}

/* =========================================================
   SCREEN RENDERERS
   ========================================================= */

function renderLandingScreen() {
  setAppHtml(`
    <div class="screen">
      <h2>Welcome to CBI Trip Planner</h2>
      <p>Community Based Instruction trip planning for Adult Transition Program students.</p>
      
      <div style="margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn-primary" onclick="goTo('teacherAuth')">
          <i class="fa-solid fa-chalkboard-user"></i> Teacher Login
        </button>
        <button class="btn-primary" onclick="goTo('studentAuth')">
          <i class="fa-solid fa-graduation-cap"></i> Student Login
        </button>
      </div>
    </div>
  `);
}

function renderTeacherAuthScreen() {
  setAppHtml(`
    <div class="screen">
      <h2>Teacher Login</h2>
      <p>Sign in or create a teacher account to manage your classes and student rosters.</p>
      
      <div style="margin-top: 24px;">
        <label for="teacherDisplayName">Display Name (for sign up)</label>
        <input type="text" id="teacherDisplayName" placeholder="Your name" />
        
        <label for="teacherEmail">Email</label>
        <input type="email" id="teacherEmail" placeholder="teacher@school.edu" />
        
        <label for="teacherPassword">Password</label>
        <input type="password" id="teacherPassword" placeholder="Enter password" />
        
        <div id="teacherAuthError" class="error-text"></div>
        
        <div style="margin-top: 18px; display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="btn-primary" onclick="teacherSignInWithEmail()">
            Sign In
          </button>
          <button class="btn-secondary" onclick="teacherSignUpWithEmail()">
            Sign Up
          </button>
          <button class="btn-secondary" onclick="teacherSignInWithGoogle()">
            <i class="fa-brands fa-google"></i> Google
          </button>
        </div>
      </div>
    </div>
  `);
}

function renderTeacherClassesScreen() {
  let classesHtml = "";
  if (teacherClasses.length === 0) {
    classesHtml = `<p class="small-note">No classes yet. Create one below.</p>`;
  } else {
    classesHtml = teacherClasses.map(c => `
      <div class="summary-card" style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${escapeHtml(c.name)}</strong>
            ${c.schoolYear ? `<span class="small-note"> - ${escapeHtml(c.schoolYear)}</span>` : ""}
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-secondary" onclick="openRosterForClass('${c.id}')">
              Open Roster
            </button>
            <button class="btn-secondary" onclick="renameClass('${c.id}')">
              Rename
            </button>
            <button class="btn-secondary" onclick="deleteClass('${c.id}')">
              Delete
            </button>
          </div>
        </div>
      </div>
    `).join("");
  }

  setAppHtml(`
    <div class="screen">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2>My Classes</h2>
        <button class="btn-secondary" onclick="appSignOut()">
          <i class="fa-solid fa-sign-out-alt"></i> Sign Out
        </button>
      </div>
      
      <div id="classesError" class="error-text"></div>
      
      ${classesHtml}
      
      <div class="summary-card" style="margin-top: 24px;">
        <h3 style="margin-top: 0;">Create New Class</h3>
        
        <label for="className">Class Name</label>
        <input type="text" id="className" placeholder="e.g., Period 3 - Life Skills" />
        
        <label for="schoolYear">School Year (optional)</label>
        <input type="text" id="schoolYear" placeholder="e.g., 2024-2025" />
        
        <div id="createClassError" class="error-text"></div>
        
        <button class="btn-primary" style="margin-top: 12px;" onclick="createClassFromForm()">
          Create Class
        </button>
      </div>
    </div>
  `);
}

function renderClassRosterScreen() {
  const className = selectedClassMeta?.name || "Class";

  let rosterHtml = "";
  if (rosterList.length === 0) {
    rosterHtml = `<p class="small-note">No students on roster yet.</p>`;
  } else {
    rosterHtml = rosterList.map(r => {
      const email = r.email || r.id;
      const status = rosterStatusMap[email] || {};
      
      let statusBadge = "";
      let actionButtons = "";

      if (!status.found) {
        statusBadge = `<span class="small-note" style="color: #999;">Not signed up</span>`;
        actionButtons = `<span class="small-note">Student must create account first</span>`;
      } else if (status.assignedToThisClass) {
        statusBadge = `<span style="color: #1AA489; font-weight: 600;">✓ Assigned</span>`;
        actionButtons = `
          <button class="btn-secondary" onclick="unassignStudent('${email}')">
            Unassign
          </button>
          <button class="btn-secondary" onclick="openStudentTripsForTeacher('${email}')">
            View Trips
          </button>
        `;
      } else if (status.assignedElsewhere) {
        statusBadge = `<span class="small-note" style="color: #ff9800;">Assigned elsewhere</span>`;
        actionButtons = `
          <button class="btn-secondary" onclick="assignStudentToThisClass('${email}')">
            Assign Here
          </button>
        `;
      } else {
        statusBadge = `<span class="small-note" style="color: #999;">Not assigned</span>`;
        actionButtons = `
          <button class="btn-secondary" onclick="assignStudentToThisClass('${email}')">
            Assign to Class
          </button>
        `;
      }

      return `
        <div class="summary-card" style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
            <div style="flex: 1;">
              <div><strong>${escapeHtml(r.name || email)}</strong></div>
              <div class="small-note">${escapeHtml(email)}</div>
              <div style="margin-top: 4px;">${statusBadge}</div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${actionButtons}
              <button class="btn-secondary" onclick="removeStudentFromRoster('${r.id}')">
                Remove
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  setAppHtml(`
    <div class="screen">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2>Roster: ${escapeHtml(className)}</h2>
        <button class="btn-secondary" onclick="goTo('teacherClasses')">
          <i class="fa-solid fa-arrow-left"></i> Back to Classes
        </button>
      </div>
      
      <div id="rosterError" class="error-text"></div>
      
      ${rosterHtml}
      
      <div class="summary-card" style="margin-top: 24px;">
        <h3 style="margin-top: 0;">Add Student to Roster</h3>
        
        <label for="rosterEmail">Student Email</label>
        <input type="email" id="rosterEmail" placeholder="student@school.edu" />
        
        <label for="rosterName">Student Name (optional)</label>
        <input type="text" id="rosterName" placeholder="Student's full name" />
        
        <button class="btn-primary" style="margin-top: 12px;" onclick="addStudentToRoster()">
          Add Student
        </button>
      </div>
    </div>
  `);
}

function renderTeacherStudentTripsScreen() {
  const studentName = selectedStudent?.name || selectedStudent?.email || "Student";

  let tripsHtml = "";
  if (studentTripsForTeacher.length === 0) {
    tripsHtml = `<p class="small-note">No trips yet.</p>`;
  } else {
    tripsHtml = studentTripsForTeacher.map(t => `
      <div class="summary-card" style="margin-bottom: 12px; cursor: pointer;" 
           onclick="openTripDetailsForTeacher('${t.id}')">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${escapeHtml(t.destinationName || "Untitled Trip")}</strong>
            <div class="small-note">${escapeHtml(t.tripDate || "No date")}</div>
          </div>
          <i class="fa-solid fa-chevron-right"></i>
        </div>
      </div>
    `).join("");
  }

  setAppHtml(`
    <div class="screen">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2>Trips: ${escapeHtml(studentName)}</h2>
        <button class="btn-secondary" onclick="backToRoster()">
          <i class="fa-solid fa-arrow-left"></i> Back to Roster
        </button>
      </div>
      
      <div id="teacherStudentTripsError" class="error-text"></div>
      
      ${tripsHtml}
    </div>
  `);
}

function renderTeacherTripDetailScreen() {
  if (!selectedTripForTeacher) {
    setAppHtml(`<div class="screen"><p>No trip selected.</p></div>`);
    return;
  }

  const t = selectedTripForTeacher;

  setAppHtml(`
    <div class="screen">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2>Trip Details</h2>
        <button class="btn-secondary" onclick="backToStudentTrips()">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
      </div>
      
      <div class="summary-card">
        <h3 style="margin-top: 0;">Destination</h3>
        <div class="summary-row">
          <div class="summary-label">Name:</div>
          <div class="summary-value">${escapeHtml(t.destinationName || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Address:</div>
          <div class="summary-value">${escapeHtml(t.destinationAddress || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Date:</div>
          <div class="summary-value">${escapeHtml(t.tripDate || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Meet Time:</div>
          <div class="summary-value">${escapeHtml(t.meetTime || "—")}</div>
        </div>
      </div>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Route There</h3>
        <div class="summary-row">
          <div class="summary-label">Bus:</div>
          <div class="summary-value">${escapeHtml(t.routeThere?.busNumber || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Direction:</div>
          <div class="summary-value">${escapeHtml(t.routeThere?.direction || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Board:</div>
          <div class="summary-value">${escapeHtml(t.routeThere?.boardStop || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Exit:</div>
          <div class="summary-value">${escapeHtml(t.routeThere?.exitStop || "—")}</div>
        </div>
      </div>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Route Back</h3>
        <div class="summary-row">
          <div class="summary-label">Bus:</div>
          <div class="summary-value">${escapeHtml(t.routeBack?.busNumber || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Direction:</div>
          <div class="summary-value">${escapeHtml(t.routeBack?.direction || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Board:</div>
          <div class="summary-value">${escapeHtml(t.routeBack?.boardStop || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Exit:</div>
          <div class="summary-value">${escapeHtml(t.routeBack?.exitStop || "—")}</div>
        </div>
      </div>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Trip Purpose</h3>
        <ul>
          ${renderPurposeSummaryListForTrip(t)}
        </ul>
      </div>
    </div>
  `);
}

function renderPurposeSummaryListForTrip(trip) {
  const p = trip.purpose || {};
  const items = [];

  if (p.lifeSkills) items.push("Life skills (shopping, ordering, daily living)");
  if (p.communityAccess) items.push("Community access and navigation");
  if (p.moneySkills) items.push("Money skills (budgeting, paying, change)");
  if (p.communication) items.push("Communication and self advocacy");
  if (p.socialSkills) items.push("Social skills and teamwork");
  if (p.employmentPrep) items.push("Employment preparation or work skills");
  if (p.recreationLeisure) items.push("Recreation and leisure in the community");
  if (p.safetySkills) items.push("Safety skills (street safety, stranger awareness, etc.)");

  if (p.otherText) items.push(`Other: ${escapeHtml(p.otherText)}`);

  if (!items.length) {
    return `<li class="small-note">No purposes selected.</li>`;
  }

  return items.map(txt => `<li>${txt}</li>`).join("");
}

function renderStudentAuthScreen() {
  setAppHtml(`
    <div class="screen">
      <h2>Student Login</h2>
      <p>Sign in or create a student account to plan your community trips.</p>
      
      <div style="margin-top: 24px;">
        <label for="studentDisplayName">Display Name (for sign up)</label>
        <input type="text" id="studentDisplayName" placeholder="Your name" />
        
        <label for="studentEmail">Email</label>
        <input type="email" id="studentEmail" placeholder="student@school.edu" />
        
        <label for="studentPassword">Password</label>
        <input type="password" id="studentPassword" placeholder="Enter password" />
        
        <div id="studentAuthError" class="error-text"></div>
        
        <div style="margin-top: 18px; display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="btn-primary" onclick="studentSignInWithEmail()">
            Sign In
          </button>
          <button class="btn-secondary" onclick="studentSignUpWithEmail()">
            Sign Up
          </button>
          <button class="btn-secondary" onclick="studentSignInWithGoogle()">
            <i class="fa-brands fa-google"></i> Google
          </button>
        </div>
      </div>
    </div>
  `);
}

function renderStudentHomeScreen() {
  const displayName = studentProfile?.displayName || authUser?.displayName || "Student";
  const assignedInfo = studentProfile?.teacherId && studentProfile?.classId
    ? `<p class="small-note">You are assigned to a teacher's class.</p>`
    : `<p class="small-note">You are not yet assigned to a class. Your teacher will assign you.</p>`;

  setAppHtml(`
    <div class="screen">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2>Welcome, ${escapeHtml(displayName)}!</h2>
        <button class="btn-secondary" onclick="appSignOut()">
          <i class="fa-solid fa-sign-out-alt"></i> Sign Out
        </button>
      </div>
      
      ${assignedInfo}
      
      <div style="margin-top: 24px;">
        <p><strong>Plan your next community trip:</strong></p>
        
        <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px;">
          <button class="btn-primary" onclick="startNewTrip(); goTo('planDestination')">
            <i class="fa-solid fa-plus"></i> Start New Trip
          </button>
          <button class="btn-secondary" onclick="goTo('studentPastTrips')">
            <i class="fa-solid fa-clock-rotate-left"></i> View Past Trips
          </button>
        </div>
      </div>
    </div>
  `);
}

function renderPlanDestinationScreen() {
  setAppHtml(`
    <div class="screen">
      <h2>Step 1: Choose Your Destination</h2>
      <p>Where do you want to go on your CBI trip?</p>
      
      <label for="destinationName">Destination Name</label>
      <input type="text" id="destinationName" 
             value="${escapeHtml(currentTrip.destinationName)}"
             placeholder="e.g., Target, Library, Starbucks"
             onchange="updateTripField('destinationName', this.value)" />
      
      <label for="destinationAddress">Destination Address</label>
      <input type="text" id="destinationAddress" 
             value="${escapeHtml(currentTrip.destinationAddress)}"
             placeholder="e.g., 123 Main St, Anaheim, CA"
             onchange="updateTripField('destinationAddress', this.value)" />
      
      <label for="tripDate">Trip Date</label>
      <input type="date" id="tripDate" 
             value="${escapeHtml(currentTrip.tripDate)}"
             onchange="updateTripField('tripDate', this.value)" />
      
      <label for="meetTime">Meet Time</label>
      <input type="time" id="meetTime" 
             value="${escapeHtml(currentTrip.meetTime)}"
             onchange="updateTripField('meetTime', this.value)" />
      
      <div style="margin-top: 24px; display: flex; gap: 12px;">
        <button class="btn-primary" onclick="goTo('mapsInstructions')">
          Next: Get Directions <i class="fa-solid fa-arrow-right"></i>
        </button>
        <button class="btn-secondary" onclick="goTo('studentHome')">
          Back to Home
        </button>
      </div>
    </div>
  `);
}

function renderMapsInstructionsScreen() {
  setAppHtml(`
    <div class="screen">
      <h2>Step 2: Get Directions on Google Maps</h2>
      <p>Click the button below to open Google Maps and get directions from school to your destination.</p>
      
      <div class="summary-card" style="margin-top: 16px;">
        <div class="summary-row">
          <div class="summary-label">From:</div>
          <div class="summary-value">Katella High School, Anaheim, CA</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">To:</div>
          <div class="summary-value">${escapeHtml(currentTrip.destinationName || "—")} ${escapeHtml(currentTrip.destinationAddress || "")}</div>
        </div>
      </div>
      
      <button class="btn-primary" style="margin-top: 18px;" onclick="openMapsForCurrentTrip()">
        <i class="fa-solid fa-map"></i> Open Google Maps
      </button>
      
      <p class="small-note" style="margin-top: 18px;">
        After you get your route information from Google Maps, click "Next" to enter your route details.
      </p>
      
      <div style="margin-top: 24px; display: flex; gap: 12px;">
        <button class="btn-primary" onclick="goTo('routeDetails')">
          Next: Enter Route Details <i class="fa-solid fa-arrow-right"></i>
        </button>
        <button class="btn-secondary" onclick="goTo('planDestination')">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
      </div>
    </div>
  `);
}

function renderRouteDetailsScreen() {
  setAppHtml(`
    <div class="screen">
      <h2>Step 3: Route Details</h2>
      <p>Enter the bus route information for getting to and from your destination.</p>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Route There</h3>
        
        <label for="routeThereBusNumber">Bus Number</label>
        <input type="text" id="routeThereBusNumber" 
               value="${escapeHtml(currentTrip.routeThere.busNumber)}"
               placeholder="e.g., 50"
               onchange="updateRouteThereField('busNumber', this.value)" />
        
        <label for="routeThereDirection">Direction</label>
        <input type="text" id="routeThereDirection" 
               value="${escapeHtml(currentTrip.routeThere.direction)}"
               placeholder="e.g., Eastbound"
               onchange="updateRouteThereField('direction', this.value)" />
        
        <label for="routeThereBoardStop">Board Stop</label>
        <input type="text" id="routeThereBoardStop" 
               value="${escapeHtml(currentTrip.routeThere.boardStop)}"
               placeholder="Where you get on"
               onchange="updateRouteThereField('boardStop', this.value)" />
        
        <label for="routeThereExitStop">Exit Stop</label>
        <input type="text" id="routeThereExitStop" 
               value="${escapeHtml(currentTrip.routeThere.exitStop)}"
               placeholder="Where you get off"
               onchange="updateRouteThereField('exitStop', this.value)" />
        
        <label for="routeThereDepartTime">Depart Time</label>
        <input type="time" id="routeThereDepartTime" 
               value="${escapeHtml(currentTrip.routeThere.departTime)}"
               onchange="updateRouteThereField('departTime', this.value)" />
        
        <label for="routeThereArriveTime">Arrive Time</label>
        <input type="time" id="routeThereArriveTime" 
               value="${escapeHtml(currentTrip.routeThere.arriveTime)}"
               onchange="updateRouteThereField('arriveTime', this.value)" />
        
        <label for="routeThereTotalTime">Total Travel Time</label>
        <input type="text" id="routeThereTotalTime" 
               value="${escapeHtml(currentTrip.routeThere.totalTime)}"
               placeholder="e.g., 25 minutes"
               onchange="updateRouteThereField('totalTime', this.value)" />
      </div>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Route Back</h3>
        
        <label for="routeBackBusNumber">Bus Number</label>
        <input type="text" id="routeBackBusNumber" 
               value="${escapeHtml(currentTrip.routeBack.busNumber)}"
               placeholder="e.g., 50"
               onchange="updateRouteBackField('busNumber', this.value)" />
        
        <label for="routeBackDirection">Direction</label>
        <input type="text" id="routeBackDirection" 
               value="${escapeHtml(currentTrip.routeBack.direction)}"
               placeholder="e.g., Westbound"
               onchange="updateRouteBackField('direction', this.value)" />
        
        <label for="routeBackBoardStop">Board Stop</label>
        <input type="text" id="routeBackBoardStop" 
               value="${escapeHtml(currentTrip.routeBack.boardStop)}"
               placeholder="Where you get on"
               onchange="updateRouteBackField('boardStop', this.value)" />
        
        <label for="routeBackExitStop">Exit Stop</label>
        <input type="text" id="routeBackExitStop" 
               value="${escapeHtml(currentTrip.routeBack.exitStop)}"
               placeholder="Where you get off"
               onchange="updateRouteBackField('exitStop', this.value)" />
        
        <label for="routeBackDepartTime">Depart Time</label>
        <input type="time" id="routeBackDepartTime" 
               value="${escapeHtml(currentTrip.routeBack.departTime)}"
               onchange="updateRouteBackField('departTime', this.value)" />
        
        <label for="routeBackArriveTime">Arrive Time</label>
        <input type="time" id="routeBackArriveTime" 
               value="${escapeHtml(currentTrip.routeBack.arriveTime)}"
               onchange="updateRouteBackField('arriveTime', this.value)" />
        
        <label for="routeBackTotalTime">Total Travel Time</label>
        <input type="text" id="routeBackTotalTime" 
               value="${escapeHtml(currentTrip.routeBack.totalTime)}"
               placeholder="e.g., 25 minutes"
               onchange="updateRouteBackField('totalTime', this.value)" />
      </div>
      
      <h2 style="margin-top: 32px;">Step 4: Trip Purpose</h2>
      <p>What skills will you practice on this trip? Check all that apply.</p>
      
      <div class="summary-card" style="margin-top: 16px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" ${currentTrip.purpose.lifeSkills ? "checked" : ""}
                 onchange="togglePurposeField('lifeSkills', this.checked)" />
          Life skills (shopping, ordering, daily living)
        </label>
        
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
          <input type="checkbox" ${currentTrip.purpose.communityAccess ? "checked" : ""}
                 onchange="togglePurposeField('communityAccess', this.checked)" />
          Community access and navigation
        </label>
        
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
          <input type="checkbox" ${currentTrip.purpose.moneySkills ? "checked" : ""}
                 onchange="togglePurposeField('moneySkills', this.checked)" />
          Money skills (budgeting, paying, change)
        </label>
        
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
          <input type="checkbox" ${currentTrip.purpose.communication ? "checked" : ""}
                 onchange="togglePurposeField('communication', this.checked)" />
          Communication and self advocacy
        </label>
        
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
          <input type="checkbox" ${currentTrip.purpose.socialSkills ? "checked" : ""}
                 onchange="togglePurposeField('socialSkills', this.checked)" />
          Social skills and teamwork
        </label>
        
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
          <input type="checkbox" ${currentTrip.purpose.employmentPrep ? "checked" : ""}
                 onchange="togglePurposeField('employmentPrep', this.checked)" />
          Employment preparation or work skills
        </label>
        
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
          <input type="checkbox" ${currentTrip.purpose.recreationLeisure ? "checked" : ""}
                 onchange="togglePurposeField('recreationLeisure', this.checked)" />
          Recreation and leisure in the community
        </label>
        
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
          <input type="checkbox" ${currentTrip.purpose.safetySkills ? "checked" : ""}
                 onchange="togglePurposeField('safetySkills', this.checked)" />
          Safety skills (street safety, stranger awareness, etc.)
        </label>
        
        <label for="purposeOther" style="margin-top: 12px;">Other (please specify):</label>
        <input type="text" id="purposeOther" 
               value="${escapeHtml(currentTrip.purpose.otherText)}"
               placeholder="Any other goals or skills"
               onchange="updatePurposeOther(this.value)" />
      </div>
      
      <div style="margin-top: 24px; display: flex; gap: 12px;">
        <button class="btn-primary" onclick="goTo('summary')">
          Next: Review & Save <i class="fa-solid fa-arrow-right"></i>
        </button>
        <button class="btn-secondary" onclick="goTo('mapsInstructions')">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
      </div>
    </div>
  `);
}

function renderSummaryScreen() {
  const isEditing = currentTripMeta.id && currentTripMeta.loadedFromFirestore;

  setAppHtml(`
    <div class="screen">
      <h2>Trip Summary</h2>
      <p>Review your trip details and save when ready.</p>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Destination</h3>
        <div class="summary-row">
          <div class="summary-label">Name:</div>
          <div class="summary-value">${escapeHtml(currentTrip.destinationName || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Address:</div>
          <div class="summary-value">${escapeHtml(currentTrip.destinationAddress || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Date:</div>
          <div class="summary-value">${escapeHtml(currentTrip.tripDate || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Meet Time:</div>
          <div class="summary-value">${escapeHtml(currentTrip.meetTime || "—")}</div>
        </div>
      </div>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Route There</h3>
        <div class="summary-row">
          <div class="summary-label">Bus:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeThere.busNumber || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Direction:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeThere.direction || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Board Stop:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeThere.boardStop || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Exit Stop:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeThere.exitStop || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Depart:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeThere.departTime || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Arrive:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeThere.arriveTime || "—")}</div>
        </div>
      </div>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Route Back</h3>
        <div class="summary-row">
          <div class="summary-label">Bus:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeBack.busNumber || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Direction:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeBack.direction || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Board Stop:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeBack.boardStop || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Exit Stop:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeBack.exitStop || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Depart:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeBack.departTime || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Arrive:</div>
          <div class="summary-value">${escapeHtml(currentTrip.routeBack.arriveTime || "—")}</div>
        </div>
      </div>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Trip Purpose</h3>
        <ul>
          ${renderPurposeSummaryList()}
        </ul>
      </div>
      
      <div style="margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn-primary" onclick="saveCurrentTrip()">
          <i class="fa-solid fa-save"></i> ${isEditing ? "Update Trip" : "Save Trip"}
        </button>
        <button class="btn-secondary" onclick="goTo('routeDetails')">
          <i class="fa-solid fa-pencil"></i> Edit Details
        </button>
        ${isEditing ? `
          <button class="btn-secondary" onclick="deleteCurrentTrip()">
            <i class="fa-solid fa-trash"></i> Delete Trip
          </button>
        ` : ""}
        <button class="btn-secondary" onclick="goTo('studentHome')">
          Back to Home
        </button>
      </div>
    </div>
  `);
}

function renderStudentPastTripsScreen() {
  let tripsHtml = "";
  if (studentTrips.length === 0) {
    tripsHtml = `<p class="small-note">You haven't created any trips yet.</p>`;
  } else {
    tripsHtml = studentTrips.map(t => `
      <div class="summary-card" style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="flex: 1;">
            <strong>${escapeHtml(t.destinationName || "Untitled Trip")}</strong>
            <div class="small-note">${escapeHtml(t.tripDate || "No date")}</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-secondary" onclick="loadTripForEditing('${t.id}')">
              Edit
            </button>
            <button class="btn-secondary" onclick="viewTripDetails('${t.id}')">
              View
            </button>
          </div>
        </div>
      </div>
    `).join("");
  }

  setAppHtml(`
    <div class="screen">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2>Past Trips</h2>
        <button class="btn-secondary" onclick="goTo('studentHome')">
          <i class="fa-solid fa-arrow-left"></i> Back to Home
        </button>
      </div>
      
      <div id="pastTripsError" class="error-text"></div>
      
      ${tripsHtml}
    </div>
  `);
}

function renderStudentTripDetailScreen() {
  if (!selectedTripForStudent) {
    setAppHtml(`<div class="screen"><p>No trip selected.</p></div>`);
    return;
  }

  const t = selectedTripForStudent;

  setAppHtml(`
    <div class="screen">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2>Trip Details</h2>
        <button class="btn-secondary" onclick="backToPastTrips()">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
      </div>
      
      <div class="summary-card">
        <h3 style="margin-top: 0;">Destination</h3>
        <div class="summary-row">
          <div class="summary-label">Name:</div>
          <div class="summary-value">${escapeHtml(t.destinationName || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Address:</div>
          <div class="summary-value">${escapeHtml(t.destinationAddress || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Date:</div>
          <div class="summary-value">${escapeHtml(t.tripDate || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Meet Time:</div>
          <div class="summary-value">${escapeHtml(t.meetTime || "—")}</div>
        </div>
      </div>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Route There</h3>
        <div class="summary-row">
          <div class="summary-label">Bus:</div>
          <div class="summary-value">${escapeHtml(t.routeThere?.busNumber || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Direction:</div>
          <div class="summary-value">${escapeHtml(t.routeThere?.direction || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Board:</div>
          <div class="summary-value">${escapeHtml(t.routeThere?.boardStop || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Exit:</div>
          <div class="summary-value">${escapeHtml(t.routeThere?.exitStop || "—")}</div>
        </div>
      </div>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Route Back</h3>
        <div class="summary-row">
          <div class="summary-label">Bus:</div>
          <div class="summary-value">${escapeHtml(t.routeBack?.busNumber || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Direction:</div>
          <div class="summary-value">${escapeHtml(t.routeBack?.direction || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Board:</div>
          <div class="summary-value">${escapeHtml(t.routeBack?.boardStop || "—")}</div>
        </div>
        <div class="summary-row">
          <div class="summary-label">Exit:</div>
          <div class="summary-value">${escapeHtml(t.routeBack?.exitStop || "—")}</div>
        </div>
      </div>
      
      <div class="summary-card" style="margin-top: 16px;">
        <h3 style="margin-top: 0;">Trip Purpose</h3>
        <ul>
          ${renderPurposeSummaryListForTrip(t)}
        </ul>
      </div>
      
      <div style="margin-top: 24px;">
        <button class="btn-secondary" onclick="loadTripForEditing('${t.id}')">
          <i class="fa-solid fa-pencil"></i> Edit This Trip
        </button>
      </div>
    </div>
  `);
}

/* =========================================================
   MAIN RENDER FUNCTION
   ========================================================= */

function render() {
  switch (currentScreen) {
    case "landing":
      renderLandingScreen();
      break;
    case "teacherAuth":
      renderTeacherAuthScreen();
      break;
    case "teacherClasses":
      renderTeacherClassesScreen();
      break;
    case "classRoster":
      renderClassRosterScreen();
      break;
    case "teacherStudentTrips":
      renderTeacherStudentTripsScreen();
      break;
    case "teacherTripDetail":
      renderTeacherTripDetailScreen();
      break;
    case "studentAuth":
      renderStudentAuthScreen();
      break;
    case "studentHome":
      renderStudentHomeScreen();
      break;
    case "planDestination":
      renderPlanDestinationScreen();
      break;
    case "mapsInstructions":
      renderMapsInstructionsScreen();
      break;
    case "routeDetails":
      renderRouteDetailsScreen();
      break;
    case "summary":
      renderSummaryScreen();
      break;
    case "studentPastTrips":
      renderStudentPastTripsScreen();
      break;
    case "studentTripDetail":
      renderStudentTripDetailScreen();
      break;
    default:
      renderLandingScreen();
  }
}

/* =========================================================
   EXPOSE FUNCTIONS TO GLOBAL SCOPE FOR ONCLICK
   ========================================================= */

window.goTo = goTo;
window.appSignOut = appSignOut;
window.teacherSignInWithEmail = teacherSignInWithEmail;
window.teacherSignUpWithEmail = teacherSignUpWithEmail;
window.teacherSignInWithGoogle = teacherSignInWithGoogle;
window.createClassFromForm = createClassFromForm;
window.renameClass = renameClass;
window.deleteClass = deleteClass;
window.openRosterForClass = openRosterForClass;
window.addStudentToRoster = addStudentToRoster;
window.removeStudentFromRoster = removeStudentFromRoster;
window.assignStudentToThisClass = assignStudentToThisClass;
window.unassignStudent = unassignStudent;
window.openStudentTripsForTeacher = openStudentTripsForTeacher;
window.openTripDetailsForTeacher = openTripDetailsForTeacher;
window.backToStudentTrips = backToStudentTrips;
window.backToRoster = backToRoster;
window.studentSignInWithEmail = studentSignInWithEmail;
window.studentSignUpWithEmail = studentSignUpWithEmail;
window.studentSignInWithGoogle = studentSignInWithGoogle;
window.startNewTrip = startNewTrip;
window.updateTripField = updateTripField;
window.updateRouteThereField = updateRouteThereField;
window.updateRouteBackField = updateRouteBackField;
window.togglePurposeField = togglePurposeField;
window.updatePurposeOther = updatePurposeOther;
window.openMapsForCurrentTrip = openMapsForCurrentTrip;
window.saveCurrentTrip = saveCurrentTrip;
window.deleteCurrentTrip = deleteCurrentTrip;
window.loadTripForEditing = loadTripForEditing;
window.viewTripDetails = viewTripDetails;
window.backToPastTrips = backToPastTrips;

/* =========================================================
   SIDEBAR NAVIGATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const sidebarItems = document.querySelectorAll(".sidebar-item[data-screen]");
  sidebarItems.forEach(btn => {
    btn.addEventListener("click", () => {
      const screenName = btn.getAttribute("data-screen");
      goTo(screenName);
    });
  });

  // Initial render
  render();
});
