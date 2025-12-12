// =========================================================
// CBI PLANNER APP
// Landing screen with Teacher and Student modes
// Teacher mode uses Firebase Auth + Firestore
// Student mode requires a teacher-selected student on this device
// =========================================================

// ----------------- FIREBASE CONFIG -----------------

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

// ----------------- STATE -----------------

let currentUser = null;
let currentScreen = "landing";

// Teacher selected context (stored locally for Student Mode)
let selectedClassId = localStorage.getItem("cbi_selectedClassId") || null;
let selectedStudentId = localStorage.getItem("cbi_selectedStudentId") || null;
let selectedStudentName = localStorage.getItem("cbi_selectedStudentName") || null;

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

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setSelectedStudent(classId, studentId, studentName) {
  selectedClassId = classId;
  selectedStudentId = studentId;
  selectedStudentName = studentName;

  localStorage.setItem("cbi_selectedClassId", classId || "");
  localStorage.setItem("cbi_selectedStudentId", studentId || "");
  localStorage.setItem("cbi_selectedStudentName", studentName || "");
}

function clearSelectedStudent() {
  selectedClassId = null;
  selectedStudentId = null;
  selectedStudentName = null;

  localStorage.removeItem("cbi_selectedClassId");
  localStorage.removeItem("cbi_selectedStudentId");
  localStorage.removeItem("cbi_selectedStudentName");
}

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

function clearTrip() {
  currentTrip = createEmptyTrip();
  render();
}

// ----------------- NAV -----------------

function goTo(screenName) {
  currentScreen = screenName;
  render();
  highlightSidebar(screenName);
}

// ----------------- GOOGLE MAPS -----------------

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

// ----------------- WEATHER LINKS -----------------

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

// ----------------- PURPOSE SUMMARY -----------------

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
// TEACHER FIRESTORE (Teacher mode only)
// Note: This uses a "teachers/{uid}/classes" structure
// =========================================================

async function loadTeacherClasses() {
  if (!currentUser) return;

  const snap = await db
    .collection("teachers")
    .doc(currentUser.uid)
    .collection("classes")
    .orderBy("createdAt", "desc")
    .get();

  teacherClassesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function createClassFromForm() {
  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

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
    const ref = await db
      .collection("teachers")
      .doc(currentUser.uid)
      .collection("classes")
      .add({
        name,
        schoolYear: schoolYear || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    selectedClassId = ref.id;
    localStorage.setItem("cbi_selectedClassId", selectedClassId);

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

async function loadClassRoster(classId) {
  if (!currentUser || !classId) return;

  const snap = await db
    .collection("teachers")
    .doc(currentUser.uid)
    .collection("classes")
    .doc(classId)
    .collection("students")
    .orderBy("createdAt", "asc")
    .get();

  classRosterCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function addStudentFromForm() {
  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }
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
      .collection("teachers")
      .doc(currentUser.uid)
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

async function openClassDetail(classId) {
  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  selectedClassId = classId;
  localStorage.setItem("cbi_selectedClassId", classId || "");

  await loadClassRoster(selectedClassId);

  currentScreen = "classDetail";
  render();
  highlightSidebar("classes");
}

function chooseStudentForDevice(studentId) {
  const student = classRosterCache.find(s => s.id === studentId);
  if (!student) return;

  setSelectedStudent(selectedClassId, studentId, student.name);

  alert("Student selected for this device. Now click Student mode on the landing page.");
  currentScreen = "landing";
  render();
  highlightSidebar("landing");
}

// =========================================================
// AUTH (Teacher)
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

  if (currentUser) {
    try {
      await loadTeacherClasses();
    } catch (e) {
      console.error(e);
    }
  }

  render();
  highlightSidebar(currentScreen);
});

// =========================================================
// RENDER
// =========================================================

function render() {
  const app = document.getElementById("app");
  if (!app) return;

  // ------------- LANDING -------------
  if (currentScreen === "landing") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="landingTitle">
        <h2 id="landingTitle">CBI Planner</h2>
        <p>Choose Teacher or Student mode.</p>

        <div class="landing-split">
          <div class="landing-card">
            <h3><i class="fa-solid fa-user-shield"></i> Teacher</h3>
            <p class="small-note">
              Teachers sign in, create classes, add students, and select a student for this device.
            </p>

            <button class="btn-primary" type="button" onclick="goTo('auth')">
              Teacher login
            </button>

            <button class="btn-secondary" type="button" onclick="goTo('classes')">
              Teacher classes
            </button>
          </div>

          <div class="landing-card">
            <h3><i class="fa-solid fa-graduation-cap"></i> Student mode</h3>
            <p class="small-note">
              Student mode works after a teacher selects a student on this device.
            </p>

            <p class="small-note">
              Selected student: <strong>${selectedStudentName ? escapeHtml(selectedStudentName) : "None yet"}</strong>
            </p>

            <button class="btn-primary" type="button" onclick="goTo('studentMode')">
              Enter student mode
            </button>

            <button class="btn-secondary" type="button" onclick="clearSelectedStudent(); render();">
              Clear selected student
            </button>
          </div>
        </div>
      </section>
    `;
    return;
  }

  // ------------- TEACHER AUTH -------------
  if (currentScreen === "auth") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="authTitle">
        <h2 id="authTitle">Teacher login</h2>
        <p>Sign in. New teachers can create an account.</p>

        <label for="authEmail">Email</label>
        <input id="authEmail" type="email" autocomplete="email" placeholder="teacher@example.com" />

        <label for="authPassword">Password</label>
        <input id="authPassword" type="password" autocomplete="current-password" placeholder="Password" />

        <label for="authName">Your name (new accounts)</label>
        <input id="authName" type="text" autocomplete="name" placeholder="Example: Mr. Keating" />

        <div class="row">
          <button class="btn-primary" type="button" onclick="handleTeacherLogin()">Sign in</button>
          <button class="btn-secondary" type="button" onclick="handleTeacherSignup()">Create teacher account</button>
        </div>

        <div class="row">
          <button class="btn-secondary" type="button" onclick="goTo('landing')">Back to Landing</button>
          ${currentUser ? `<button class="btn-secondary" type="button" onclick="signOutTeacher()">Sign out</button>` : ""}
        </div>

        <div id="authMessage" class="small-note"></div>
      </section>
    `;
    return;
  }

  // ------------- TEACHER CLASSES -------------
  if (currentScreen === "classes") {
    if (!currentUser) {
      app.innerHTML = `
        <section class="screen">
          <h2>Teacher classes</h2>
          <p>You need to sign in first.</p>
          <button class="btn-primary" type="button" onclick="goTo('auth')">Go to Teacher login</button>
          <button class="btn-secondary" type="button" onclick="goTo('landing')">Back to Landing</button>
        </section>
      `;
      return;
    }

    const cards = teacherClassesCache
      .map(c => {
        const title = escapeHtml(c.name || "Untitled class");
        const sub = c.schoolYear ? `School year: ${escapeHtml(c.schoolYear)}` : "School year not set";
        return `
          <div class="landing-card">
            <h3>${title}</h3>
            <p class="small-note">${sub}</p>
            <div class="row">
              <button class="btn-primary" type="button" onclick="openClassDetail('${c.id}')">Open</button>
            </div>
          </div>
        `;
      })
      .join("");

    app.innerHTML = `
      <section class="screen" aria-labelledby="classesTitle">
        <h2 id="classesTitle">Teacher classes</h2>
        <p class="small-note">Signed in as: <strong>${escapeHtml(currentUser.email)}</strong></p>

        <div class="landing-card">
          <h3>Create class</h3>

          <label for="className">Class name</label>
          <input id="className" type="text" placeholder="Example: Keating ATP" />

          <label for="classSchoolYear">School year</label>
          <input id="classSchoolYear" type="text" placeholder="Example: 25-26" />

          <div class="row">
            <button class="btn-primary" type="button" onclick="createClassFromForm()">Create class</button>
            <button class="btn-secondary" type="button" onclick="signOutTeacher()">Sign out</button>
          </div>

          <div id="classCreateMsg" class="small-note"></div>
        </div>

        <div class="landing-split">
          ${cards || `<p class="small-note">No classes yet. Create one above.</p>`}
        </div>

        <button class="btn-secondary" type="button" onclick="goTo('landing')">Back to Landing</button>
      </section>
    `;
    return;
  }

  // ------------- CLASS DETAIL -------------
  if (currentScreen === "classDetail") {
    if (!currentUser || !selectedClassId) {
      goTo("classes");
      return;
    }

    const classObj = teacherClassesCache.find(c => c.id === selectedClassId);
    const classTitle = classObj ? escapeHtml(classObj.name) : "Class";
    const classSub = classObj && classObj.schoolYear ? `School year: ${escapeHtml(classObj.schoolYear)}` : "";

    const rosterCards = classRosterCache
      .map(s => {
        return `
          <div class="landing-card">
            <h3>${escapeHtml(s.name)}</h3>
            <p class="small-note">Select this student for this device so Student mode works.</p>
            <button class="btn-primary" type="button" onclick="chooseStudentForDevice('${s.id}')">
              Select student
            </button>
          </div>
        `;
      })
      .join("");

    app.innerHTML = `
      <section class="screen">
        <h2>${classTitle}</h2>
        <p class="small-note">${classSub}</p>

        <div class="landing-card">
          <h3>Add student</h3>

          <label for="studentName">Student name</label>
          <input id="studentName" type="text" placeholder="Example: Diego" />

          <div class="row">
            <button class="btn-primary" type="button" onclick="addStudentFromForm()">Add student</button>
            <button class="btn-secondary" type="button" onclick="goTo('classes')">Back to classes</button>
          </div>

          <div id="rosterMsg" class="small-note"></div>
        </div>

        <div class="landing-split">
          ${rosterCards || `<p class="small-note">No students yet. Add one above.</p>`}
        </div>
      </section>
    `;
    return;
  }

  // ------------- STUDENT MODE GATE -------------
  if (currentScreen === "studentMode") {
    const hasStudent = Boolean(selectedStudentId && selectedStudentName);

    app.innerHTML = `
      <section class="screen" aria-labelledby="studentModeTitle">
        <h2 id="studentModeTitle">Student mode</h2>

        <p class="small-note">
          Selected student: <strong>${hasStudent ? escapeHtml(selectedStudentName) : "None yet"}</strong>
        </p>

        ${
          hasStudent
            ? `
              <p>You can start your trip plan now.</p>

              <div class="row">
                <button class="btn-primary" type="button" onclick="goTo('planDestination')">Start Step 1</button>
                <button class="btn-secondary" type="button" onclick="clearTrip()">Clear trip</button>
              </div>

              <p class="small-note">
                Reminder: You will open Google Maps, then type the route details yourself.
              </p>
            `
            : `
              <p>
                A teacher needs to select your name on this device first.
              </p>
              <ol class="small-note" style="margin-left:18px;">
                <li>Teacher signs in</li>
                <li>Teacher opens a class</li>
                <li>Teacher clicks "Select student"</li>
                <li>Then you click Student mode</li>
              </ol>

              <div class="row">
                <button class="btn-primary" type="button" onclick="goTo('landing')">Back to Landing</button>
                <button class="btn-secondary" type="button" onclick="goTo('auth')">Teacher login</button>
              </div>
            `
        }
      </section>
    `;
    return;
  }

  // ------------- STEP 1 -------------
  if (currentScreen === "planDestination") {
    if (!selectedStudentId) {
      goTo("studentMode");
      return;
    }

    app.innerHTML = `
      <section class="screen" aria-labelledby="step1Title">
        <h2 id="step1Title">Step 1 - Basic info</h2>
        <p>Student: <strong>${escapeHtml(selectedStudentName)}</strong></p>

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
          <button class="btn-primary" type="button" onclick="goTo('mapsInstructions')">Go to Step 2</button>
          <button class="btn-secondary" type="button" onclick="clearTrip()">Clear trip</button>
        </div>
      </section>
    `;
    return;
  }

  // ------------- STEP 2 -------------
  if (currentScreen === "mapsInstructions") {
    if (!selectedStudentId) {
      goTo("studentMode");
      return;
    }

    app.innerHTML = `
      <section class="screen" aria-labelledby="step2Title">
        <h2 id="step2Title">Step 2 - Google Maps steps</h2>
        <p>Open Google Maps, then come back and type the route details yourself.</p>

        <ol style="margin-left:18px; color:#244b55;">
          <li>Tap "Open Google Maps (Transit)"</li>
          <li>Confirm starting point is your school</li>
          <li>Choose transit mode</li>
          <li>Pick a route</li>
          <li>Write down bus number, stops, times</li>
          <li>Come back to Step 3</li>
        </ol>

        <div class="row">
          <button class="btn-primary" type="button" onclick="openMapsForCurrentTrip()">Open Google Maps (Transit)</button>
          <button class="btn-primary" type="button" onclick="goTo('routeDetails')">Go to Step 3</button>
          <button class="btn-secondary" type="button" onclick="goTo('planDestination')">Back to Step 1</button>
        </div>
      </section>
    `;
    return;
  }

  // ------------- STEP 3 and 4 -------------
  if (currentScreen === "routeDetails") {
    if (!selectedStudentId) {
      goTo("studentMode");
      return;
    }

    const r = currentTrip.routeThere;
    const rb = currentTrip.routeBack;
    const p = currentTrip.purpose;

    app.innerHTML = `
      <section class="screen" aria-labelledby="step3Title">
        <h2 id="step3Title">Step 3 - Route details</h2>

        <h3 class="section-title">Route there</h3>

        <label for="busNumber">Bus number</label>
        <input id="busNumber" type="text" value="${escapeHtml(r.busNumber)}"
          oninput="updateRouteThereField('busNumber', this.value)" />

        <label for="direction">Direction</label>
        <input id="direction" type="text" value="${escapeHtml(r.direction)}"
          oninput="updateRouteThereField('direction', this.value)" />

        <label for="boardStop">Stop where you get on</label>
        <input id="boardStop" type="text" value="${escapeHtml(r.boardStop)}"
          oninput="updateRouteThereField('boardStop', this.value)" />

        <label for="exitStop">Stop where you get off</label>
        <input id="exitStop" type="text" value="${escapeHtml(r.exitStop)}"
          oninput="updateRouteThereField('exitStop', this.value)" />

        <label for="departTime">Departure time</label>
        <input id="departTime" type="text" value="${escapeHtml(r.departTime)}"
          oninput="updateRouteThereField('departTime', this.value)" />

        <label for="arriveTime">Arrival time</label>
        <input id="arriveTime" type="text" value="${escapeHtml(r.arriveTime)}"
          oninput="updateRouteThereField('arriveTime', this.value)" />

        <label for="totalTime">Total travel time</label>
        <input id="totalTime" type="text" value="${escapeHtml(r.totalTime)}"
          oninput="updateRouteThereField('totalTime', this.value)" />

        <h3 class="section-title">Route back</h3>

        <label for="busNumberBack">Bus number</label>
        <input id="busNumberBack" type="text" value="${escapeHtml(rb.busNumber)}"
          oninput="updateRouteBackField('busNumber', this.value)" />

        <label for="directionBack">Direction</label>
        <input id="directionBack" type="text" value="${escapeHtml(rb.direction)}"
          oninput="updateRouteBackField('direction', this.value)" />

        <label for="boardStopBack">Stop where you get on</label>
        <input id="boardStopBack" type="text" value="${escapeHtml(rb.boardStop)}"
          oninput="updateRouteBackField('boardStop', this.value)" />

        <label for="exitStopBack">Stop where you get off</label>
        <input id="exitStopBack" type="text" value="${escapeHtml(rb.exitStop)}"
          oninput="updateRouteBackField('exitStop', this.value)" />

        <label for="departTimeBack">Departure time</label>
        <input id="departTimeBack" type="text" value="${escapeHtml(rb.departTime)}"
          oninput="updateRouteBackField('departTime', this.value)" />

        <label for="arriveTimeBack">Arrival time</label>
        <input id="arriveTimeBack" type="text" value="${escapeHtml(rb.arriveTime)}"
          oninput="updateRouteBackField('arriveTime', this.value)" />

        <label for="totalTimeBack">Total travel time</label>
        <input id="totalTimeBack" type="text" value="${escapeHtml(rb.totalTime)}"
          oninput="updateRouteBackField('totalTime', this.value)" />

        <h3 class="section-title">Step 4 - Why are we going?</h3>

        <label style="display:flex; gap:10px; align-items:center;">
          <input type="checkbox" ${p.lifeSkills ? "checked" : ""} onchange="togglePurposeField('lifeSkills', this.checked)" />
          Life skills
        </label>

        <label style="display:flex; gap:10px; align-items:center;">
          <input type="checkbox" ${p.communityAccess ? "checked" : ""} onchange="togglePurposeField('communityAccess', this.checked)" />
          Community access
        </label>

        <label style="display:flex; gap:10px; align-items:center;">
          <input type="checkbox" ${p.moneySkills ? "checked" : ""} onchange="togglePurposeField('moneySkills', this.checked)" />
          Money skills
        </label>

        <label style="display:flex; gap:10px; align-items:center;">
          <input type="checkbox" ${p.communication ? "checked" : ""} onchange="togglePurposeField('communication', this.checked)" />
          Communication
        </label>

        <label style="display:flex; gap:10px; align-items:center;">
          <input type="checkbox" ${p.socialSkills ? "checked" : ""} onchange="togglePurposeField('socialSkills', this.checked)" />
          Social skills
        </label>

        <label style="display:flex; gap:10px; align-items:center;">
          <input type="checkbox" ${p.employmentPrep ? "checked" : ""} onchange="togglePurposeField('employmentPrep', this.checked)" />
          Employment prep
        </label>

        <label style="display:flex; gap:10px; align-items:center;">
          <input type="checkbox" ${p.recreationLeisure ? "checked" : ""} onchange="togglePurposeField('recreationLeisure', this.checked)" />
          Recreation
        </label>

        <label style="display:flex; gap:10px; align-items:center;">
          <input type="checkbox" ${p.safetySkills ? "checked" : ""} onchange="togglePurposeField('safetySkills', this.checked)" />
          Safety skills
        </label>

        <label for="purposeOther">Other</label>
        <input id="purposeOther" type="text" value="${escapeHtml(p.otherText)}"
          oninput="updatePurposeOther(this.value)" />

        <div class="row">
          <button class="btn-primary" type="button" onclick="goTo('weatherLinks')">Check weather</button>
          <button class="btn-primary" type="button" onclick="goTo('summary')">Trip summary</button>
          <button class="btn-secondary" type="button" onclick="goTo('mapsInstructions')">Back to Step 2</button>
        </div>
      </section>
    `;
    return;
  }

  // ------------- WEATHER LINKS SCREEN -------------
  if (currentScreen === "weatherLinks") {
    if (!selectedStudentId) {
      goTo("studentMode");
      return;
    }

    app.innerHTML = `
      <section class="screen" aria-labelledby="weatherTitle">
        <h2 id="weatherTitle">Check weather</h2>
        <p>Type a city, then click a weather site. After that, write what you will bring.</p>

        <label for="weatherCity">City</label>
        <input
          id="weatherCity"
          type="text"
          placeholder="Anaheim"
          value="${escapeHtml(currentTrip.weather.city)}"
          oninput="updateWeatherCity(this.value)"
        />

        <div class="weather-grid">
          <div class="weather-card" role="button" tabindex="0" onclick="openWeatherSite('accuweather')">
            <img src="images/Accu_weather.png" alt="AccuWeather logo" />
            <div class="weather-text">
              <strong>AccuWeather</strong>
              <span>Open in a new tab</span>
            </div>
          </div>

          <div class="weather-card" role="button" tabindex="0" onclick="openWeatherSite('weatherChannel')">
            <img src="images/Weather_com_Logo.png" alt="Weather.com logo" />
            <div class="weather-text">
              <strong>Weather.com</strong>
              <span>Open in a new tab</span>
            </div>
          </div>
        </div>

        <label for="weatherBring" style="margin-top:16px;">What will you bring?</label>
        <textarea
          id="weatherBring"
          placeholder="Example: jacket, water, umbrella"
          oninput="updateWeatherWhatToBring(this.value)"
        >${escapeHtml(currentTrip.weather.whatToBring)}</textarea>

        <div class="row">
          <button class="btn-primary" type="button" onclick="goTo('summary')">Trip summary</button>
          <button class="btn-secondary" type="button" onclick="goTo('routeDetails')">Back</button>
        </div>
      </section>
    `;
    return;
  }

  // ------------- SUMMARY -------------
  if (currentScreen === "summary") {
    const pHtml = renderPurposeSummaryList();

    app.innerHTML = `
      <section class="screen" aria-labelledby="summaryTitle">
        <h2 id="summaryTitle">Trip summary</h2>
        <p>Student: <strong>${selectedStudentName ? escapeHtml(selectedStudentName) : "None"}</strong></p>

        <h3 class="section-title">Trip basics</h3>
        <p><strong>Destination:</strong> ${escapeHtml(currentTrip.destinationName) || "-"}</p>
        <p><strong>Address:</strong> ${escapeHtml(currentTrip.destinationAddress) || "-"}</p>
        <p><strong>Date:</strong> ${escapeHtml(currentTrip.tripDate) || "-"}</p>
        <p><strong>Meet time:</strong> ${escapeHtml(currentTrip.meetTime) || "-"}</p>

        <h3 class="section-title">Why are we going?</h3>
        <ul style="margin-left:18px; color:#244b55;">
          ${pHtml}
        </ul>

        <h3 class="section-title">Weather and packing</h3>
        <p><strong>City:</strong> ${escapeHtml(currentTrip.weather.city) || "-"}</p>
        <p><strong>Student plan:</strong> ${escapeHtml(currentTrip.weather.whatToBring) || "Not filled in yet."}</p>

        <div class="row">
          <button class="btn-primary" type="button" onclick="goTo('planDestination')">Edit Step 1</button>
          <button class="btn-secondary" type="button" onclick="goTo('routeDetails')">Edit Step 3 and 4</button>
          <button class="btn-secondary" type="button" onclick="goTo('weatherLinks')">Edit weather</button>
          <button class="btn-secondary" type="button" onclick="clearTrip()">Clear trip</button>
        </div>
      </section>
    `;
    return;
  }

  // Fallback
  app.innerHTML = `<section class="screen"><h2>Screen not found</h2></section>`;
}

// =========================================================
// SIDEBAR
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
  highlightSidebar(currentScreen);

  const sidebarItems = document.querySelectorAll(".sidebar-item");
  sidebarItems.forEach(item => {
    const screen = item.getAttribute("data-screen");

    item.addEventListener("click", async () => {
      if (!screen) return;

      if (screen === "classes" && currentUser) {
        await loadTeacherClasses();
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
