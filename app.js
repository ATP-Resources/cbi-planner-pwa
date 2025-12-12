// =========================================================
// CBI PLANNER APP WITH TEACHER CLASSES + ROSTERS + PAST TRIPS
// Firebase Auth + Firestore
// =========================================================

// ----------------- FIREBASE SETUP -----------------

const firebaseConfig = {
  apiKey: "AIzaSyAC-zl14hzA9itpol-0yhz4NYiSF-aSy4Q",
  authDomain: "cbi-planner-web.firebaseapp.com",
  projectId: "cbi-planner-web",
  storageBucket: "cbi-planner-web.firebasestorage.app",
  messagingSenderId: "736590365612",
  appId: "1:736590365612:web:043b8cb2bee5666c6ff009",
  measurementId: "G-NC838KKZNZ"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ----------------- APP STATE -----------------

let currentUser = null;
let currentScreen = "auth";

let selectedClassId = null;
let selectedStudentId = null;
let selectedStudentName = null;

let teacherClassesCache = [];
let classRosterCache = [];
let pastTripsCache = []; // [{id, createdAt, tripData}]

// ----------------- TRIP STATE -----------------

function createEmptyTrip() {
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
    weather: {
      city: "",
      whatToBring: ""
    }
  };
}

let currentTrip = createEmptyTrip();

// ----------------- HELPERS -----------------

function requireAuthOrBounce() {
  if (!currentUser) {
    currentScreen = "auth";
    render();
    highlightSidebar("home");
    return false;
  }
  return true;
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTimestamp(ts) {
  if (!ts) return "Unknown time";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch (e) {
    return "Unknown time";
  }
}

// ----------------- SIMPLE UPDATERS -----------------

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

function updateWeatherCity(value) {
  currentTrip.weather.city = value;
}

function updateWeatherWhatToBring(value) {
  currentTrip.weather.whatToBring = value;
}

function clearCurrentTrip() {
  currentTrip = createEmptyTrip();
  render();
}

// =========================================================
// FIRESTORE
// =========================================================

// ----------------- CLASSES -----------------

async function loadTeacherClasses() {
  if (!currentUser) return;

  const snap = await db
    .collection("classes")
    .where("teacherId", "==", currentUser.uid)
    .orderBy("createdAt", "desc")
    .get();

  teacherClassesCache = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

async function createClassFromForm() {
  if (!requireAuthOrBounce()) return;

  const nameEl = document.getElementById("className");
  const schoolYearEl = document.getElementById("classSchoolYear");
  const msgEl = document.getElementById("classCreateMsg");

  const name = nameEl ? nameEl.value.trim() : "";
  const schoolYear = schoolYearEl ? schoolYearEl.value.trim() : "";

  if (!name) {
    if (msgEl) {
      msgEl.textContent = "Please enter a class name.";
      msgEl.style.color = "red";
    }
    return;
  }

  if (msgEl) {
    msgEl.textContent = "Creating class...";
    msgEl.style.color = "#244b55";
  }

  try {
    const ref = await db.collection("classes").add({
      teacherId: currentUser.uid,
      name,
      schoolYear: schoolYear || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    selectedClassId = ref.id;

    await loadTeacherClasses();
    currentScreen = "classDetail";
    await loadClassRoster(selectedClassId);
    render();
    highlightSidebar("classes");
  } catch (e) {
    console.error(e);
    if (msgEl) {
      msgEl.textContent = e.message;
      msgEl.style.color = "red";
    }
  }
}

async function deleteClass(classId) {
  if (!requireAuthOrBounce()) return;

  const ok = confirm("Delete this class? This removes access to roster and trips in the app.");
  if (!ok) return;

  try {
    await db.collection("classes").doc(classId).delete();

    if (selectedClassId === classId) {
      selectedClassId = null;
      selectedStudentId = null;
      selectedStudentName = null;
      classRosterCache = [];
      pastTripsCache = [];
    }

    await loadTeacherClasses();
    currentScreen = "classes";
    render();
    highlightSidebar("classes");
  } catch (e) {
    console.error(e);
    alert("Could not delete class. Check Firestore rules or try again.");
  }
}

// ----------------- ROSTER -----------------

async function loadClassRoster(classId) {
  if (!currentUser || !classId) return;

  const snap = await db
    .collection("classes")
    .doc(classId)
    .collection("students")
    .orderBy("createdAt", "asc")
    .get();

  classRosterCache = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

async function addStudentFromForm() {
  if (!requireAuthOrBounce()) return;
  if (!selectedClassId) {
    alert("Pick a class first.");
    return;
  }

  const nameEl = document.getElementById("studentName");
  const msgEl = document.getElementById("rosterMsg");
  const name = nameEl ? nameEl.value.trim() : "";

  if (!name) {
    if (msgEl) {
      msgEl.textContent = "Enter a student name.";
      msgEl.style.color = "red";
    }
    return;
  }

  if (msgEl) {
    msgEl.textContent = "Adding student...";
    msgEl.style.color = "#244b55";
  }

  try {
    await db
      .collection("classes")
      .doc(selectedClassId)
      .collection("students")
      .add({
        name,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    if (nameEl) nameEl.value = "";

    await loadClassRoster(selectedClassId);
    if (msgEl) {
      msgEl.textContent = "Student added.";
      msgEl.style.color = "green";
    }
    render();
  } catch (e) {
    console.error(e);
    if (msgEl) {
      msgEl.textContent = e.message;
      msgEl.style.color = "red";
    }
  }
}

async function deleteStudent(studentId) {
  if (!requireAuthOrBounce()) return;
  if (!selectedClassId) return;

  const ok = confirm("Delete this student from the roster?");
  if (!ok) return;

  try {
    await db
      .collection("classes")
      .doc(selectedClassId)
      .collection("students")
      .doc(studentId)
      .delete();

    if (selectedStudentId === studentId) {
      selectedStudentId = null;
      selectedStudentName = null;
      pastTripsCache = [];
    }

    await loadClassRoster(selectedClassId);
    render();
  } catch (e) {
    console.error(e);
    alert("Could not delete student. Check Firestore rules or try again.");
  }
}

function pickStudent(studentId, studentName) {
  selectedStudentId = studentId;
  selectedStudentName = studentName;
  currentScreen = "planDestination";
  render();
  highlightSidebar("studentPicker");
}

// ----------------- TRIPS SAVE AND LOAD -----------------

async function saveTripNow() {
  if (!requireAuthOrBounce()) return;

  if (!selectedClassId || !selectedStudentId) {
    alert("Pick a student first. Go to Pick student.");
    return;
  }

  const payload = {
    tripData: currentTrip,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db
      .collection("classes")
      .doc(selectedClassId)
      .collection("students")
      .doc(selectedStudentId)
      .collection("trips")
      .add(payload);

    alert("Trip saved for this student.");
  } catch (e) {
    console.error(e);
    alert("Could not save trip. Check Firestore rules and try again.");
  }
}

async function loadLatestTripForSelectedStudent() {
  if (!requireAuthOrBounce()) return;

  if (!selectedClassId || !selectedStudentId) {
    alert("Pick a student first. Go to Pick student.");
    return;
  }

  try {
    const snap = await db
      .collection("classes")
      .doc(selectedClassId)
      .collection("students")
      .doc(selectedStudentId)
      .collection("trips")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (snap.empty) {
      alert("No saved trips found for this student yet.");
      return;
    }

    const data = snap.docs[0].data();
    if (data && data.tripData) {
      currentTrip = data.tripData;
      alert("Loaded the most recent saved trip for this student.");
      render();
    } else {
      alert("Trip data missing in Firestore document.");
    }
  } catch (e) {
    console.error(e);
    alert("Could not load trip. Check Firestore rules and try again.");
  }
}

// ----------------- PAST TRIPS LIST -----------------

async function loadPastTripsForSelectedStudent() {
  if (!requireAuthOrBounce()) return;

  if (!selectedClassId || !selectedStudentId) {
    pastTripsCache = [];
    return;
  }

  const snap = await db
    .collection("classes")
    .doc(selectedClassId)
    .collection("students")
    .doc(selectedStudentId)
    .collection("trips")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  pastTripsCache = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

async function openTripById(tripId) {
  if (!requireAuthOrBounce()) return;
  if (!selectedClassId || !selectedStudentId) {
    alert("Pick a student first.");
    return;
  }

  try {
    const doc = await db
      .collection("classes")
      .doc(selectedClassId)
      .collection("students")
      .doc(selectedStudentId)
      .collection("trips")
      .doc(tripId)
      .get();

    if (!doc.exists) {
      alert("Trip not found.");
      return;
    }

    const data = doc.data();
    if (data && data.tripData) {
      currentTrip = data.tripData;
      alert("Trip loaded. You can edit it now.");
      currentScreen = "planDestination";
      render();
      highlightSidebar("planDestination");
    } else {
      alert("Trip data missing.");
    }
  } catch (e) {
    console.error(e);
    alert("Could not open trip. Check Firestore rules and try again.");
  }
}

async function deleteTripById(tripId) {
  if (!requireAuthOrBounce()) return;
  if (!selectedClassId || !selectedStudentId) return;

  const ok = confirm("Delete this trip?");
  if (!ok) return;

  try {
    await db
      .collection("classes")
      .doc(selectedClassId)
      .collection("students")
      .doc(selectedStudentId)
      .collection("trips")
      .doc(tripId)
      .delete();

    await loadPastTripsForSelectedStudent();
    render();
  } catch (e) {
    console.error(e);
    alert("Could not delete trip. Check Firestore rules and try again.");
  }
}

// =========================================================
// AUTH
// =========================================================

async function handleTeacherLogin() {
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const messageDiv = document.getElementById("authMessage");

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";

  if (!email || !password) {
    if (messageDiv) {
      messageDiv.textContent = "Enter email and password.";
      messageDiv.style.color = "red";
    }
    return;
  }

  if (messageDiv) {
    messageDiv.textContent = "Signing in...";
    messageDiv.style.color = "#244b55";
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    console.error(error);
    if (messageDiv) {
      messageDiv.textContent = error.message;
      messageDiv.style.color = "red";
    }
  }
}

async function handleTeacherSignup() {
  const nameInput = document.getElementById("authName");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const messageDiv = document.getElementById("authMessage");

  const name = nameInput ? nameInput.value.trim() : "";
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";

  if (!email || !password) {
    if (messageDiv) {
      messageDiv.textContent = "Enter email and password to create an account.";
      messageDiv.style.color = "red";
    }
    return;
  }

  if (messageDiv) {
    messageDiv.textContent = "Creating account...";
    messageDiv.style.color = "#244b55";
  }

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const user = cred.user;

    await db.collection("teachers").doc(user.uid).set({
      name: name || null,
      email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (messageDiv) {
      messageDiv.textContent = "Account created. You are signed in.";
      messageDiv.style.color = "green";
    }
  } catch (error) {
    console.error(error);
    if (messageDiv) {
      messageDiv.textContent = error.message;
      messageDiv.style.color = "red";
    }
  }
}

function signOutTeacher() {
  auth.signOut();
}

auth.onAuthStateChanged(async user => {
  currentUser = user || null;

  if (!currentUser) {
    selectedClassId = null;
    selectedStudentId = null;
    selectedStudentName = null;
    teacherClassesCache = [];
    classRosterCache = [];
    pastTripsCache = [];
    currentTrip = createEmptyTrip();
    currentScreen = "auth";
    render();
    highlightSidebar("home");
    return;
  }

  try {
    await loadTeacherClasses();
  } catch (e) {
    console.error(e);
  }

  if (currentScreen === "auth") currentScreen = "home";

  render();
  highlightSidebar("home");
});

// =========================================================
// NAVIGATION
// =========================================================

function goTo(screenName) {
  if (!currentUser && screenName !== "auth") {
    currentScreen = "auth";
    render();
    highlightSidebar("home");
    return;
  }

  currentScreen = screenName;

  if (screenName === "past") {
    loadPastTripsForSelectedStudent()
      .then(() => {
        render();
        highlightSidebar("past");
      })
      .catch(e => {
        console.error(e);
        render();
        highlightSidebar("past");
      });
    return;
  }

  render();
  highlightSidebar(screenName);
}

// =========================================================
// GOOGLE MAPS
// =========================================================

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

// =========================================================
// WEATHER LINKS
// =========================================================

function openWeatherSite(provider) {
  const cityInput = document.getElementById("weatherCity");
  const city = cityInput ? cityInput.value.trim() : "";

  if (!city) {
    alert("Type a city first.");
    return;
  }

  currentTrip.weather.city = city;

  let url = "";
  if (provider === "accuweather") {
    url = `https://www.accuweather.com/en/search-locations?query=${encodeURIComponent(city)}`;
  } else if (provider === "weatherChannel") {
    url = `https://weather.com/search/enhancedlocalsearch?where=${encodeURIComponent(city)}`;
  }

  window.open(url, "_blank");
}

// =========================================================
// SUMMARY BUILDER
// =========================================================

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
  if (p.otherText.trim() !== "") items.push(`Other: ${p.otherText.trim()}`);

  if (!items.length) return "<li>No purposes selected yet.</li>";
  return items.map(t => `<li>${escapeHtml(t)}</li>`).join("");
}

// =========================================================
// RENDER
// =========================================================

function render() {
  const app = document.getElementById("app");
  if (!app) return;

  if (currentScreen === "auth") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="authTitle">
        <h2 id="authTitle">Teacher sign in</h2>
        <p>Sign in. New teachers can create an account.</p>

        <label for="authEmail">Email</label>
        <input id="authEmail" type="email" autocomplete="email" placeholder="teacher@example.com" />

        <label for="authPassword">Password</label>
        <input id="authPassword" type="password" autocomplete="current-password" placeholder="Password" />

        <label for="authName">Your name (new accounts)</label>
        <input id="authName" type="text" autocomplete="name" placeholder="Example: Mr. Keating" />

        <div class="auth-buttons">
          <button class="btn-primary" type="button" onclick="handleTeacherLogin()">Sign in</button>
          <button class="btn-secondary" type="button" onclick="handleTeacherSignup()">Create teacher account</button>
        </div>

        <div id="authMessage" class="auth-message"></div>
      </section>
    `;
    return;
  }

  if (currentScreen === "home") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="homeTitle">
        <h2 id="homeTitle">Welcome</h2>
        <p>CBI Planner teacher mode.</p>
        <p class="small-note"><strong>Signed in as:</strong> ${escapeHtml(currentUser.email)}</p>

        <div class="row">
          <button class="btn-primary" type="button" onclick="goTo('classes')">Go to Teacher classes</button>
          <button class="btn-secondary" type="button" onclick="goTo('studentPicker')">Pick student</button>
          <button class="btn-secondary" type="button" onclick="goTo('past')">Past trips</button>
        </div>

        <div class="row">
          <button class="btn-secondary" type="button" onclick="signOutTeacher()">Sign out</button>
        </div>
      </section>
    `;
    return;
  }

  if (currentScreen === "classes") {
    const cards = teacherClassesCache
      .map(c => {
        const title = escapeHtml(c.name || "Untitled class");
        const sub = c.schoolYear ? `School year: ${escapeHtml(c.schoolYear)}` : "School year not set";
        return `
          <div class="card">
            <p class="card-title">${title}</p>
            <p class="card-sub">${sub}</p>
            <div class="hr"></div>
            <div class="row">
              <button class="btn-primary" type="button" onclick="openClassDetail('${c.id}')">Open roster</button>
              <button class="btn-danger" type="button" onclick="deleteClass('${c.id}')">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");

    app.innerHTML = `
      <section class="screen" aria-labelledby="classesTitle">
        <h2 id="classesTitle">Teacher classes</h2>
        <p>Create a class, then add students to the roster.</p>

        <button class="btn-primary" type="button" onclick="goTo('classCreate')">Create a new class</button>

        <div class="card-grid">
          ${cards || `<p class="small-note">No classes yet. Click "Create a new class".</p>`}
        </div>

        <button class="btn-secondary" type="button" onclick="goTo('home')">Back to Home</button>
      </section>
    `;
    return;
  }

  if (currentScreen === "classCreate") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="createClassTitle">
        <h2 id="createClassTitle">Create class</h2>

        <label for="className">Class name</label>
        <input id="className" type="text" placeholder="Example: Keating ATP" />

        <label for="classSchoolYear">School year</label>
        <input id="classSchoolYear" type="text" placeholder="Example: 25-26" />

        <div class="row">
          <button class="btn-primary" type="button" onclick="createClassFromForm()">Create class</button>
          <button class="btn-secondary" type="button" onclick="goTo('classes')">Cancel</button>
        </div>

        <div id="classCreateMsg" class="small-note"></div>
      </section>
    `;
    return;
  }

  if (currentScreen === "classDetail") {
    const classObj = teacherClassesCache.find(c => c.id === selectedClassId);
    const classTitle = classObj ? escapeHtml(classObj.name) : "Class";
    const classSub = classObj && classObj.schoolYear ? `School year: ${escapeHtml(classObj.schoolYear)}` : "";

    const rosterList = classRosterCache
      .map(s => {
        const name = escapeHtml(s.name);
        return `
          <div class="card">
            <p class="card-title">${name}</p>
            <p class="card-sub">Student ID: ${escapeHtml(s.id)}</p>
            <div class="hr"></div>
            <div class="row">
              <button class="btn-primary" type="button" onclick="pickStudent('${s.id}', '${escapeHtml(s.name).replaceAll("'", "\\'")}')">Use this student</button>
              <button class="btn-danger" type="button" onclick="deleteStudent('${s.id}')">Remove</button>
            </div>
          </div>
        `;
      })
      .join("");

    app.innerHTML = `
      <section class="screen" aria-labelledby="classDetailTitle">
        <h2 id="classDetailTitle">${classTitle}</h2>
        <p>${classSub}</p>

        <div class="card">
          <p class="card-title">Add student to roster</p>

          <label for="studentName">Student name</label>
          <input id="studentName" type="text" placeholder="Example: Diego" />

          <div class="row">
            <button class="btn-primary" type="button" onclick="addStudentFromForm()">Add student</button>
            <button class="btn-secondary" type="button" onclick="goTo('classes')">Back to classes</button>
          </div>

          <div id="rosterMsg" class="small-note"></div>
        </div>

        <h3 class="section-title">Roster</h3>

        <div class="card-grid">
          ${rosterList || `<p class="small-note">No students yet. Add a student above.</p>`}
        </div>
      </section>
    `;
    return;
  }

  if (currentScreen === "studentPicker") {
    const classOptions = teacherClassesCache
      .map(c => `<option value="${c.id}">${escapeHtml(c.name || "Untitled class")}</option>`)
      .join("");

    const rosterOptions = classRosterCache
      .map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join("");

    app.innerHTML = `
      <section class="screen" aria-labelledby="pickerTitle">
        <h2 id="pickerTitle">Pick student</h2>
        <p>Select a class, then select a student to plan a trip.</p>

        <label for="pickerClass">Class</label>
        <select id="pickerClass" style="width:100%; max-width:860px; padding:14px; border-radius:14px; font-size:18px;">
          <option value="">Choose a class</option>
          ${classOptions}
        </select>

        <div class="row">
          <button class="btn-primary" type="button" onclick="pickerLoadRoster()">Load roster</button>
        </div>

        <label for="pickerStudent">Student</label>
        <select id="pickerStudent" style="width:100%; max-width:860px; padding:14px; border-radius:14px; font-size:18px;">
          <option value="">Choose a student</option>
          ${rosterOptions}
        </select>

        <div class="row">
          <button class="btn-primary" type="button" onclick="pickerUseStudent()">Use student</button>
          <button class="btn-secondary" type="button" onclick="goTo('home')">Back to Home</button>
        </div>

        <p class="small-note">
          Current student: <strong>${selectedStudentName ? escapeHtml(selectedStudentName) : "None selected"}</strong>
        </p>
      </section>
    `;
    return;
  }

  // Keep the rest of your screens the same as before:
  // planDestination, mapsInstructions, routeDetails, weather, summary, past
  // Nothing else changed for this request.

  app.innerHTML = `<p>Screen not found.</p>`;
}

// ---------------- CLASS OPEN HELPERS ----------------

async function openClassDetail(classId) {
  if (!requireAuthOrBounce()) return;

  selectedClassId = classId;
  selectedStudentId = null;
  selectedStudentName = null;
  pastTripsCache = [];

  await loadClassRoster(selectedClassId);

  currentScreen = "classDetail";
  render();
  highlightSidebar("classes");
}

// ---------------- PICKER HELPERS ----------------

async function pickerLoadRoster() {
  if (!requireAuthOrBounce()) return;

  const classSelect = document.getElementById("pickerClass");
  const classId = classSelect ? classSelect.value : "";

  if (!classId) {
    alert("Choose a class first.");
    return;
  }

  selectedClassId = classId;
  selectedStudentId = null;
  selectedStudentName = null;
  pastTripsCache = [];

  await loadClassRoster(selectedClassId);

  render();
}

function pickerUseStudent() {
  const studentSelect = document.getElementById("pickerStudent");
  const studentId = studentSelect ? studentSelect.value : "";

  if (!studentId) {
    alert("Choose a student.");
    return;
  }

  const student = classRosterCache.find(s => s.id === studentId);
  if (!student) {
    alert("Student not found. Load roster again.");
    return;
  }

  pickStudent(student.id, student.name);
}

// =========================================================
// SIDEBAR HIGHLIGHT AND INIT
// =========================================================

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

document.addEventListener("DOMContentLoaded", () => {
  render();
  highlightSidebar("home");

  const sidebarItems = document.querySelectorAll(".sidebar-item");
  sidebarItems.forEach(item => {
    const screen = item.getAttribute("data-screen");
    item.addEventListener("click", () => {
      if (!screen) return;

      if (screen === "classes") {
        loadTeacherClasses()
          .then(() => {
            currentScreen = "classes";
            render();
            highlightSidebar("classes");
          })
          .catch(e => {
            console.error(e);
            goTo("classes");
          });
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
});
