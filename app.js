// =========================================================
// CBI PLANNER APP WITH TEACHER CLASSES + ROSTERS
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

// Selected class and student (teacher workflow)
let selectedClassId = null;
let selectedStudentId = null;
let selectedStudentName = null;

// Local caches for teacher screens
let teacherClassesCache = [];
let classRosterCache = [];

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
// FIRESTORE DATA MODEL
// teachers/{uid}
// classes/{classId} { teacherId, name, period, createdAt }
// classes/{classId}/students/{studentId} { name, createdAt }
// classes/{classId}/students/{studentId}/trips/{tripId} { tripData, createdAt }
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
  const periodEl = document.getElementById("classPeriod");
  const msgEl = document.getElementById("classCreateMsg");

  const name = nameEl ? nameEl.value.trim() : "";
  const period = periodEl ? periodEl.value.trim() : "";

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
      period: period || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    selectedClassId = ref.id;

    await loadTeacherClasses();
    currentScreen = "classDetail";
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

  const ok = confirm("Delete this class? This will remove access to the roster and trips in the app.");
  if (!ok) return;

  try {
    await db.collection("classes").doc(classId).delete();
    if (selectedClassId === classId) {
      selectedClassId = null;
      selectedStudentId = null;
      selectedStudentName = null;
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

    const doc = snap.docs[0];
    const data = doc.data();

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

  if (currentScreen === "auth") {
    currentScreen = "home";
  }

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

  // ---------------- AUTH ----------------
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

  // ---------------- HOME ----------------
  if (currentScreen === "home") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="homeTitle">
        <h2 id="homeTitle">Welcome</h2>
        <p>CBI Planner teacher mode.</p>
        <p class="small-note"><strong>Signed in as:</strong> ${escapeHtml(currentUser.email)}</p>

        <div class="row">
          <button class="btn-primary" type="button" onclick="goTo('classes')">Go to Teacher classes</button>
          <button class="btn-secondary" type="button" onclick="goTo('studentPicker')">Pick student</button>
        </div>

        <div class="row">
          <button class="btn-secondary" type="button" onclick="signOutTeacher()">Sign out</button>
        </div>
      </section>
    `;
    return;
  }

  // ---------------- CLASSES LIST ----------------
  if (currentScreen === "classes") {
    const cards = teacherClassesCache
      .map(c => {
        const title = escapeHtml(c.name || "Untitled class");
        const period = c.period ? `Period: ${escapeHtml(c.period)}` : "No period set";
        return `
          <div class="card">
            <p class="card-title">${title}</p>
            <p class="card-sub">${period}</p>
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

  // ---------------- CREATE CLASS ----------------
  if (currentScreen === "classCreate") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="createClassTitle">
        <h2 id="createClassTitle">Create class</h2>

        <label for="className">Class name</label>
        <input id="className" type="text" placeholder="Example: Keating ATP" />

        <label for="classPeriod">Period or section (optional)</label>
        <input id="classPeriod" type="text" placeholder="Example: 3rd period" />

        <div class="row">
          <button class="btn-primary" type="button" onclick="createClassFromForm()">Create class</button>
          <button class="btn-secondary" type="button" onclick="goTo('classes')">Cancel</button>
        </div>

        <div id="classCreateMsg" class="small-note"></div>
      </section>
    `;
    return;
  }

  // ---------------- CLASS DETAIL + ROSTER ----------------
  if (currentScreen === "classDetail") {
    const classObj = teacherClassesCache.find(c => c.id === selectedClassId);
    const classTitle = classObj ? escapeHtml(classObj.name) : "Class";
    const classSub = classObj && classObj.period ? `Period: ${escapeHtml(classObj.period)}` : "";

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

  // ---------------- STUDENT PICKER ----------------
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

  // ---------------- STEP 1 ----------------
  if (currentScreen === "planDestination") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="step1Title">
        <h2 id="step1Title">Step 1 - Basic info</h2>

        <p class="small-note">
          Student: <strong>${selectedStudentName ? escapeHtml(selectedStudentName) : "No student selected"}</strong>
          ${selectedClassId ? "" : "<br />Tip: Go to Pick student first."}
        </p>

        <label for="destName">Destination name</label>
        <input
          id="destName"
          type="text"
          autocomplete="off"
          placeholder="Example: Target"
          value="${escapeHtml(currentTrip.destinationName)}"
          oninput="updateTripField('destinationName', this.value)"
        />

        <label for="destAddress">Destination address</label>
        <input
          id="destAddress"
          type="text"
          autocomplete="off"
          placeholder="Street, city, state"
          value="${escapeHtml(currentTrip.destinationAddress)}"
          oninput="updateTripField('destinationAddress', this.value)"
        />

        <label for="tripDate">Date of trip</label>
        <input
          id="tripDate"
          type="date"
          value="${escapeHtml(currentTrip.tripDate)}"
          oninput="updateTripField('tripDate', this.value)"
        />

        <label for="meetTime">Meet time</label>
        <input
          id="meetTime"
          type="time"
          value="${escapeHtml(currentTrip.meetTime)}"
          oninput="updateTripField('meetTime', this.value)"
        />

        <div class="row">
          <button class="btn-primary" type="button" onclick="goTo('mapsInstructions')">
            Go to Step 2
          </button>

          <button class="btn-secondary" type="button" onclick="loadLatestTripForSelectedStudent()">
            Load latest trip
          </button>

          <button class="btn-secondary" type="button" onclick="clearCurrentTrip()">
            Clear trip
          </button>
        </div>

        <button class="btn-secondary" type="button" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
    return;
  }

  // ---------------- STEP 2 ----------------
  if (currentScreen === "mapsInstructions") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="step2Title">
        <h2 id="step2Title">Step 2 - Use Google Maps</h2>
        <p>Follow these steps to find your bus route. Write details in Step 3.</p>

        <ol class="step-list">
          <li>Confirm destination in Step 1.</li>
          <li>Open Google Maps in transit mode.</li>
          <li>Choose the route you can follow.</li>
          <li>Write down bus number, stops, times, total time.</li>
          <li>Return and type it into Step 3.</li>
        </ol>

        <button class="btn-primary" type="button" onclick="openMapsForCurrentTrip()">
          Open in Google Maps (Transit)
        </button>

        <button class="btn-primary" type="button" onclick="goTo('routeDetails')">
          Go to Step 3
        </button>

        <button class="btn-secondary" type="button" onclick="goTo('planDestination')">
          Back to Step 1
        </button>
      </section>
    `;
    return;
  }

  // ---------------- STEP 3 + PURPOSE ----------------
  if (currentScreen === "routeDetails") {
    const r = currentTrip.routeThere;
    const rb = currentTrip.routeBack;
    const p = currentTrip.purpose;

    app.innerHTML = `
      <section class="screen" aria-labelledby="step3Title">
        <h2 id="step3Title">Step 3 - Route details</h2>
        <p>Use notes from Google Maps. Type the information yourself.</p>

        <h3 class="section-title">Route there</h3>

        <label for="busNumber">Bus number</label>
        <input id="busNumber" type="text" value="${escapeHtml(r.busNumber)}" oninput="updateRouteThereField('busNumber', this.value)" />

        <label for="direction">Direction</label>
        <input id="direction" type="text" value="${escapeHtml(r.direction)}" oninput="updateRouteThereField('direction', this.value)" />

        <label for="boardStop">Stop where you get on</label>
        <input id="boardStop" type="text" value="${escapeHtml(r.boardStop)}" oninput="updateRouteThereField('boardStop', this.value)" />

        <label for="exitStop">Stop where you get off</label>
        <input id="exitStop" type="text" value="${escapeHtml(r.exitStop)}" oninput="updateRouteThereField('exitStop', this.value)" />

        <label for="departTime">Departure time</label>
        <input id="departTime" type="text" value="${escapeHtml(r.departTime)}" oninput="updateRouteThereField('departTime', this.value)" />

        <label for="arriveTime">Arrival time</label>
        <input id="arriveTime" type="text" value="${escapeHtml(r.arriveTime)}" oninput="updateRouteThereField('arriveTime', this.value)" />

        <label for="totalTime">Total travel time</label>
        <input id="totalTime" type="text" value="${escapeHtml(r.totalTime)}" oninput="updateRouteThereField('totalTime', this.value)" />

        <h3 class="section-title" style="margin-top:24px;">Route back</h3>

        <label for="busNumberBack">Bus number</label>
        <input id="busNumberBack" type="text" value="${escapeHtml(rb.busNumber)}" oninput="updateRouteBackField('busNumber', this.value)" />

        <label for="directionBack">Direction</label>
        <input id="directionBack" type="text" value="${escapeHtml(rb.direction)}" oninput="updateRouteBackField('direction', this.value)" />

        <label for="boardStopBack">Stop where you get on</label>
        <input id="boardStopBack" type="text" value="${escapeHtml(rb.boardStop)}" oninput="updateRouteBackField('boardStop', this.value)" />

        <label for="exitStopBack">Stop where you get off</label>
        <input id="exitStopBack" type="text" value="${escapeHtml(rb.exitStop)}" oninput="updateRouteBackField('exitStop', this.value)" />

        <label for="departTimeBack">Departure time</label>
        <input id="departTimeBack" type="text" value="${escapeHtml(rb.departTime)}" oninput="updateRouteBackField('departTime', this.value)" />

        <label for="arriveTimeBack">Arrival time</label>
        <input id="arriveTimeBack" type="text" value="${escapeHtml(rb.arriveTime)}" oninput="updateRouteBackField('arriveTime', this.value)" />

        <label for="totalTimeBack">Total travel time</label>
        <input id="totalTimeBack" type="text" value="${escapeHtml(rb.totalTime)}" oninput="updateRouteBackField('totalTime', this.value)" />

        <h3 class="section-title" style="margin-top:24px;">Step 4 - Why are we going?</h3>

        <div class="purpose-grid">
          <label class="purpose-item">
            <input type="checkbox" ${p.lifeSkills ? "checked" : ""} onchange="togglePurposeField('lifeSkills', this.checked)" />
            Life skills (shopping, ordering, daily living)
          </label>

          <label class="purpose-item">
            <input type="checkbox" ${p.communityAccess ? "checked" : ""} onchange="togglePurposeField('communityAccess', this.checked)" />
            Community access and navigation
          </label>

          <label class="purpose-item">
            <input type="checkbox" ${p.moneySkills ? "checked" : ""} onchange="togglePurposeField('moneySkills', this.checked)" />
            Money skills (budgeting, paying, change)
          </label>

          <label class="purpose-item">
            <input type="checkbox" ${p.communication ? "checked" : ""} onchange="togglePurposeField('communication', this.checked)" />
            Communication and self advocacy
          </label>

          <label class="purpose-item">
            <input type="checkbox" ${p.socialSkills ? "checked" : ""} onchange="togglePurposeField('socialSkills', this.checked)" />
            Social skills and teamwork
          </label>

          <label class="purpose-item">
            <input type="checkbox" ${p.employmentPrep ? "checked" : ""} onchange="togglePurposeField('employmentPrep', this.checked)" />
            Employment preparation or work skills
          </label>

          <label class="purpose-item">
            <input type="checkbox" ${p.recreationLeisure ? "checked" : ""} onchange="togglePurposeField('recreationLeisure', this.checked)" />
            Recreation and leisure in the community
          </label>

          <label class="purpose-item">
            <input type="checkbox" ${p.safetySkills ? "checked" : ""} onchange="togglePurposeField('safetySkills', this.checked)" />
            Safety skills (street safety, stranger awareness, etc.)
          </label>
        </div>

        <label for="purposeOther">Other reason</label>
        <input id="purposeOther" type="text" value="${escapeHtml(p.otherText)}" oninput="updatePurposeOther(this.value)" />

        <div class="row">
          <button class="btn-primary" type="button" onclick="goTo('summary')">View Trip summary</button>
          <button class="btn-secondary" type="button" onclick="goTo('mapsInstructions')">Back to Step 2</button>
        </div>
      </section>
    `;
    return;
  }

  // ---------------- WEATHER ----------------
  if (currentScreen === "weather") {
    const w = currentTrip.weather;
    const cityValue = w.city || "";

    app.innerHTML = `
      <section class="screen" aria-labelledby="weatherTitle">
        <h2 id="weatherTitle">Check Weather for Your Trip</h2>
        <p>Type the city, then choose a weather website.</p>

        <label for="weatherCity">City or destination</label>
        <input
          id="weatherCity"
          type="text"
          placeholder="Example: Anaheim"
          autocomplete="off"
          value="${escapeHtml(cityValue)}"
          oninput="updateWeatherCity(this.value)"
        />

        <div class="weather-links">
          <button class="weather-card" type="button" onclick="openWeatherSite('accuweather')">
            <img src="img/accuweather-logo.png" alt="AccuWeather logo" class="weather-logo" />
            <span>Open AccuWeather</span>
          </button>

          <button class="weather-card" type="button" onclick="openWeatherSite('weatherChannel')">
            <img src="img/weather-channel-logo.png" alt="The Weather Channel logo" class="weather-logo" />
            <span>Open The Weather Channel</span>
          </button>
        </div>

        <label for="weatherBring" style="margin-top:20px;">Based on this weather, what will you bring?</label>
        <textarea id="weatherBring" placeholder="Example: jacket, umbrella, water, bus pass" oninput="updateWeatherWhatToBring(this.value)">${escapeHtml(w.whatToBring)}</textarea>

        <button class="btn-secondary" type="button" onclick="goTo('home')">Back to Home</button>
      </section>
    `;
    return;
  }

  // ---------------- SUMMARY ----------------
  if (currentScreen === "summary") {
    const r = currentTrip.routeThere;
    const rb = currentTrip.routeBack;
    const pHtml = renderPurposeSummaryList();
    const w = currentTrip.weather;

    app.innerHTML = `
      <section class="screen" aria-labelledby="summaryTitle">
        <h2 id="summaryTitle">Trip summary</h2>

        <p class="small-note">
          Student: <strong>${selectedStudentName ? escapeHtml(selectedStudentName) : "No student selected"}</strong>
        </p>

        <div class="summary-grid">
          <article class="summary-card">
            <h4>Trip basics</h4>
            <div class="summary-row"><span class="summary-label">Destination:</span><span class="summary-value">${escapeHtml(currentTrip.destinationName || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Address:</span><span class="summary-value">${escapeHtml(currentTrip.destinationAddress || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Date:</span><span class="summary-value">${escapeHtml(currentTrip.tripDate || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Meet time:</span><span class="summary-value">${escapeHtml(currentTrip.meetTime || "-")}</span></div>
          </article>

          <article class="summary-card">
            <h4>Route there</h4>
            <div class="summary-row"><span class="summary-label">Bus number:</span><span class="summary-value">${escapeHtml(r.busNumber || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Direction:</span><span class="summary-value">${escapeHtml(r.direction || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Get on at:</span><span class="summary-value">${escapeHtml(r.boardStop || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Get off at:</span><span class="summary-value">${escapeHtml(r.exitStop || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Depart:</span><span class="summary-value">${escapeHtml(r.departTime || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Arrive:</span><span class="summary-value">${escapeHtml(r.arriveTime || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Total time:</span><span class="summary-value">${escapeHtml(r.totalTime || "-")}</span></div>
          </article>

          <article class="summary-card">
            <h4>Route back</h4>
            <div class="summary-row"><span class="summary-label">Bus number:</span><span class="summary-value">${escapeHtml(rb.busNumber || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Direction:</span><span class="summary-value">${escapeHtml(rb.direction || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Get on at:</span><span class="summary-value">${escapeHtml(rb.boardStop || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Get off at:</span><span class="summary-value">${escapeHtml(rb.exitStop || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Depart:</span><span class="summary-value">${escapeHtml(rb.departTime || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Arrive:</span><span class="summary-value">${escapeHtml(rb.arriveTime || "-")}</span></div>
            <div class="summary-row"><span class="summary-label">Total time:</span><span class="summary-value">${escapeHtml(rb.totalTime || "-")}</span></div>
          </article>

          <article class="summary-card">
            <h4>Why are we going?</h4>
            <ul class="summary-list">${pHtml}</ul>
          </article>

          <article class="summary-card">
            <h4>Weather and packing</h4>
            <div class="summary-row"><span class="summary-label">City:</span><span class="summary-value">${escapeHtml(w.city || "-")}</span></div>
            <div style="margin-top:8px; font-size:14px; color:#244b55;">
              <strong>Student plan:</strong><br />
              ${w.whatToBring ? escapeHtml(w.whatToBring) : "Not filled in yet."}
            </div>
          </article>
        </div>

        <div class="row">
          <button class="btn-primary" type="button" onclick="saveTripNow()">Save this trip</button>
          <button class="btn-secondary" type="button" onclick="goTo('planDestination')">Edit Step 1</button>
          <button class="btn-secondary" type="button" onclick="goTo('routeDetails')">Edit route</button>
          <button class="btn-secondary" type="button" onclick="goTo('weather')">Edit weather</button>
        </div>
      </section>
    `;
    return;
  }

  // ---------------- PLACEHOLDERS ----------------
  if (currentScreen === "past") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="pastTitle">
        <h2 id="pastTitle">Past trips</h2>
        <p>This screen will be upgraded next to show saved trips per student.</p>
        <button class="btn-secondary" type="button" onclick="goTo('home')">Back to Home</button>
      </section>
    `;
    return;
  }

  if (currentScreen === "practice") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="practiceTitle">
        <h2 id="practiceTitle">Practice using maps</h2>
        <p>Use this for practice scenarios before a real CBI trip.</p>
        <button class="btn-secondary" type="button" onclick="goTo('home')">Back to Home</button>
      </section>
    `;
    return;
  }

  app.innerHTML = `<p>Screen not found.</p>`;
}

// ---------------- CLASS OPEN HELPERS ----------------

async function openClassDetail(classId) {
  if (!requireAuthOrBounce()) return;

  selectedClassId = classId;
  selectedStudentId = null;
  selectedStudentName = null;

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

      if (screen === "studentPicker") {
        // If a class is already selected, keep roster loaded
        goTo("studentPicker");
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
