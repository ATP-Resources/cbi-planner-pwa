// =========================================================
// CBI PLANNER APP WITH TEACHER LOGIN
// Firebase Auth + Firestore + student-facing planner
// =========================================================

// ----------------- FIREBASE SETUP -----------------

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAC-zl14hzA9itpol-0yhz4NYiSF-aSy4Q",
  authDomain: "cbi-planner-web.firebaseapp.com",
  projectId: "cbi-planner-web",
  storageBucket: "cbi-planner-web.firebasestorage.app",
  messagingSenderId: "736590365612",
  appId: "1:736590365612:web:043b8cb2bee5666c6ff009",
  measurementId: "G-NC838KKZNZ"
};

// Initialize Firebase (global firebase object comes from script tags in index.html)
firebase.initializeApp(firebaseConfig);

// Shortcuts
const auth = firebase.auth();
const db = firebase.firestore();

// Current signed in teacher
let currentUser = null;

// ----------------- TRIP STATE -----------------

function createEmptyTrip() {
  return {
    // Step 1 - basic info
    destinationName: "",
    destinationAddress: "",
    tripDate: "",
    meetTime: "",

    // Route there
    routeThere: {
      busNumber: "",
      direction: "",
      boardStop: "",
      exitStop: "",
      departTime: "",
      arriveTime: "",
      totalTime: ""
    },

    // Route back
    routeBack: {
      busNumber: "",
      direction: "",
      boardStop: "",
      exitStop: "",
      departTime: "",
      arriveTime: "",
      totalTime: ""
    },

    // Purpose of trip
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

    // Weather notes, students interpret weather themselves
    weather: {
      city: "",
      whatToBring: ""
    }
  };
}

// Current screen name
let currentScreen = "auth"; // default to auth until Firebase tells us
let currentTrip = createEmptyTrip();

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
// GOOGLE MAPS INTEGRATION
// Opens transit directions only, students still copy details
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
// WEATHER LINKS (NO API KEY)
// Students type a city, then open a weather site in a new tab
// =========================================================

function openWeatherSite(provider) {
  const cityInput = document.getElementById("weatherCity");
  const city = cityInput ? cityInput.value.trim() : "";

  if (!city) {
    alert("Type a city or destination first.");
    return;
  }

  currentTrip.weather.city = city;

  let url = "";
  if (provider === "accuweather") {
    url = `https://www.accuweather.com/en/search-locations?query=${encodeURIComponent(
      city
    )}`;
  } else if (provider === "weatherChannel") {
    url = `https://weather.com/search/enhancedlocalsearch?where=${encodeURIComponent(
      city
    )}`;
  }

  if (url) {
    window.open(url, "_blank");
  }
}

// =========================================================
// PURPOSE SUMMARY BUILDER
// =========================================================

function renderPurposeSummaryList() {
  const p = currentTrip.purpose;
  const items = [];

  if (p.lifeSkills) {
    items.push("Life skills (shopping, ordering, daily living)");
  }
  if (p.communityAccess) {
    items.push("Community access and navigation");
  }
  if (p.moneySkills) {
    items.push("Money skills (budgeting, paying, change)");
  }
  if (p.communication) {
    items.push("Communication and self advocacy");
  }
  if (p.socialSkills) {
    items.push("Social skills and teamwork");
  }
  if (p.employmentPrep) {
    items.push("Employment preparation or work skills");
  }
  if (p.recreationLeisure) {
    items.push("Recreation and leisure in the community");
  }
  if (p.safetySkills) {
    items.push("Safety skills (street safety, stranger awareness, etc.)");
  }
  if (p.otherText.trim() !== "") {
    items.push(`Other: ${p.otherText.trim()}`);
  }

  if (!items.length) {
    return "<li>No purposes selected yet.</li>";
  }

  return items.map(text => `<li>${text}</li>`).join("");
}

// =========================================================
// TEACHER AUTH HANDLERS
// =========================================================

async function handleTeacherLogin() {
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const messageDiv = document.getElementById("authMessage");

  if (!emailInput || !passwordInput || !messageDiv) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    messageDiv.textContent = "Enter email and password.";
    messageDiv.style.color = "red";
    return;
  }

  messageDiv.textContent = "Signing in...";
  messageDiv.style.color = "#244b55";

  try {
    await auth.signInWithEmailAndPassword(email, password);
    messageDiv.textContent = "";
  } catch (error) {
    console.error(error);
    messageDiv.textContent = error.message;
    messageDiv.style.color = "red";
  }
}

async function handleTeacherSignup() {
  const nameInput = document.getElementById("authName");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const messageDiv = document.getElementById("authMessage");

  if (!emailInput || !passwordInput || !messageDiv) return;

  const name = nameInput ? nameInput.value.trim() : "";
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    messageDiv.textContent = "Enter email and password to create an account.";
    messageDiv.style.color = "red";
    return;
  }

  messageDiv.textContent = "Creating account...";
  messageDiv.style.color = "#244b55";

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const user = cred.user;

    await db.collection("teachers").doc(user.uid).set({
      name: name || null,
      email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    messageDiv.textContent = "Account created. You are signed in.";
    messageDiv.style.color = "green";
  } catch (error) {
    console.error(error);
    messageDiv.textContent = error.message;
    messageDiv.style.color = "red";
  }
}

function signOutTeacher() {
  auth.signOut();
}

// Listen for auth changes and switch screens
auth.onAuthStateChanged(user => {
  currentUser = user || null;

  if (currentUser) {
    if (currentScreen === "auth") {
      currentScreen = "home";
    }
  } else {
    currentTrip = createEmptyTrip();
    currentScreen = "auth";
  }

  render();
  highlightSidebar(currentScreen);
});

// =========================================================
// SCREEN RENDERING
// =========================================================

function goTo(screenName) {
  // Block navigation if not signed in
  if (!currentUser && screenName !== "auth") {
    currentScreen = "auth";
    render();
    highlightSidebar(currentScreen);
    return;
  }

  currentScreen = screenName;
  render();
  highlightSidebar(screenName);
}

function render() {
  const app = document.getElementById("app");

  if (!app) {
    console.error("App container not found.");
    return;
  }

  // ----------------- AUTH SCREEN -----------------
  if (currentScreen === "auth") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="authTitle">
        <h2 id="authTitle">Teacher sign in</h2>
        <p>
          Sign in with your school email. New teachers can create an account below.
        </p>

        <label for="authEmail">Email</label>
        <input
          id="authEmail"
          type="email"
          autocomplete="email"
          placeholder="teacher@example.com"
        />

        <label for="authPassword">Password</label>
        <input
          id="authPassword"
          type="password"
          autocomplete="current-password"
          placeholder="Choose a strong password"
        />

        <label for="authName">Your name (for new accounts)</label>
        <input
          id="authName"
          type="text"
          autocomplete="name"
          placeholder="Example: Mr. Keating"
        />

        <div class="auth-buttons">
          <button class="btn-primary" type="button" onclick="handleTeacherLogin()">
            Sign in
          </button>
          <button class="btn-secondary" type="button" onclick="handleTeacherSignup()">
            Create teacher account
          </button>
        </div>

        <p class="small-note">
          Tip: Use a password you are comfortable sharing with trusted classroom staff if they help you run CBI trips.
        </p>

        <div id="authMessage" class="auth-message"></div>
      </section>
    `;
    return;
  }

  // From this point on, we assume there is a currentUser

  // ----------------- HOME SCREEN -----------------
  if (currentScreen === "home") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="homeTitle">
        <h2 id="homeTitle">Welcome</h2>
        <p>Use this CBI Planner to get ready for your community based instruction trip.</p>
        <p class="small-note">
          You will use Google Maps, read information, and type the details yourself.
          The app does not do the planning for you.
        </p>

        ${
          currentUser
            ? `<p class="small-note"><strong>Signed in as:</strong> ${currentUser.email}</p>`
            : ""
        }

        <button class="btn-primary" type="button" onclick="goTo('planDestination')">
          Start a new CBI trip
        </button>

        <button class="btn-secondary" type="button" onclick="goTo('practice')">
          Practice using Google Maps first
        </button>

        <button class="btn-secondary" type="button" onclick="signOutTeacher()" style="margin-top:20px;">
          Sign out
        </button>
      </section>
    `;
  }

  // ----------------- STEP 1 - BASIC INFO -----------------
  else if (currentScreen === "planDestination") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="step1Title">
        <h2 id="step1Title">Step 1 - Basic info</h2>
        <p>Enter the basic information for your CBI trip.</p>

        <label for="destName">Destination name</label>
        <input
          id="destName"
          type="text"
          autocomplete="off"
          placeholder="Example: Target, Costco, Ayres Hotel"
          value="${currentTrip.destinationName}"
          oninput="updateTripField('destinationName', this.value)"
        />

        <label for="destAddress">Destination address</label>
        <input
          id="destAddress"
          type="text"
          autocomplete="off"
          placeholder="Street, city, state"
          value="${currentTrip.destinationAddress}"
          oninput="updateTripField('destinationAddress', this.value)"
        />

        <label for="tripDate">Date of trip</label>
        <input
          id="tripDate"
          type="date"
          value="${currentTrip.tripDate}"
          oninput="updateTripField('tripDate', this.value)"
        />

        <label for="meetTime">Meet time</label>
        <input
          id="meetTime"
          type="time"
          value="${currentTrip.meetTime}"
          oninput="updateTripField('meetTime', this.value)"
        />

        <button class="btn-primary" type="button" onclick="goTo('mapsInstructions')">
          Go to Step 2 - Google Maps steps
        </button>

        <button class="btn-secondary" type="button" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
  }

  // ----------------- STEP 2 - GOOGLE MAPS INSTRUCTIONS -----------------
  else if (currentScreen === "mapsInstructions") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="step2Title">
        <h2 id="step2Title">Step 2 - Use Google Maps</h2>
        <p>Follow these steps to find your bus route. You will write the details in Step 3.</p>

        <ol class="step-list">
          <li>Check that the destination name and address in Step 1 are correct.</li>
          <li>Tap the button below to open Google Maps in transit mode.</li>
          <li>Make sure the starting point is your school.</li>
          <li>Switch to transit view if needed so you see bus routes.</li>
          <li>Look at the different routes and choose one that:
            <ul>
              <li>Arrives on time</li>
              <li>Has the fewest transfers</li>
              <li>Feels easiest for you to follow</li>
            </ul>
          </li>
          <li>Write down:
            <ul>
              <li>Bus number and direction</li>
              <li>Stop where you get on</li>
              <li>Stop where you get off</li>
              <li>Departure and arrival time</li>
              <li>Total travel time</li>
            </ul>
          </li>
          <li>Come back to this planner and type the information in Step 3.</li>
        </ol>

        <button class="btn-primary" type="button" onclick="openMapsForCurrentTrip()">
          Open in Google Maps (Transit)
        </button>

        <button class="btn-primary" type="button" onclick="goTo('routeDetails')">
          Go to Step 3 - Route details
        </button>

        <button class="btn-secondary" type="button" onclick="goTo('planDestination')">
          Back to Step 1
        </button>
      </section>
    `;
  }

  // ----------------- STEP 3 - ROUTE DETAILS + PURPOSE -----------------
  else if (currentScreen === "routeDetails") {
    const r = currentTrip.routeThere;
    const rb = currentTrip.routeBack;
    const p = currentTrip.purpose;

    app.innerHTML = `
      <section class="screen" aria-labelledby="step3Title">
        <h2 id="step3Title">Step 3 - Route details</h2>
        <p>Use your notes from Google Maps. Type the information yourself.</p>

        <h3 class="section-title">Route there</h3>

        <label for="busNumber">Bus number</label>
        <input
          id="busNumber"
          type="text"
          placeholder="Example: Route 47"
          value="${r.busNumber}"
          oninput="updateRouteThereField('busNumber', this.value)"
        />

        <label for="direction">Direction</label>
        <input
          id="direction"
          type="text"
          placeholder="Example: To Anaheim"
          value="${r.direction}"
          oninput="updateRouteThereField('direction', this.value)"
        />

        <label for="boardStop">Stop where you get on</label>
        <input
          id="boardStop"
          type="text"
          placeholder="Example: Katella and State College"
          value="${r.boardStop}"
          oninput="updateRouteThereField('boardStop', this.value)"
        />

        <label for="exitStop">Stop where you get off</label>
        <input
          id="exitStop"
          type="text"
          placeholder="Example: Lincoln and State College"
          value="${r.exitStop}"
          oninput="updateRouteThereField('exitStop', this.value)"
        />

        <label for="departTime">Departure time</label>
        <input
          id="departTime"
          type="text"
          placeholder="Example: 9:15 AM"
          value="${r.departTime}"
          oninput="updateRouteThereField('departTime', this.value)"
        />

        <label for="arriveTime">Arrival time</label>
        <input
          id="arriveTime"
          type="text"
          placeholder="Example: 9:42 AM"
          value="${r.arriveTime}"
          oninput="updateRouteThereField('arriveTime', this.value)"
        />

        <label for="totalTime">Total travel time</label>
        <input
          id="totalTime"
          type="text"
          placeholder="Example: 27 minutes"
          value="${r.totalTime}"
          oninput="updateRouteThereField('totalTime', this.value)"
        />

        <h3 class="section-title" style="margin-top:24px;">Route back</h3>

        <label for="busNumberBack">Bus number</label>
        <input
          id="busNumberBack"
          type="text"
          placeholder="Example: Route 47"
          value="${rb.busNumber}"
          oninput="updateRouteBackField('busNumber', this.value)"
        />

        <label for="directionBack">Direction</label>
        <input
          id="directionBack"
          type="text"
          placeholder="Example: To Katella High School"
          value="${rb.direction}"
          oninput="updateRouteBackField('direction', this.value)"
        />

        <label for="boardStopBack">Stop where you get on</label>
        <input
          id="boardStopBack"
          type="text"
          placeholder="Example: Lincoln and State College"
          value="${rb.boardStop}"
          oninput="updateRouteBackField('boardStop', this.value)"
        />

        <label for="exitStopBack">Stop where you get off</label>
        <input
          id="exitStopBack"
          type="text"
          placeholder="Example: Katella and State College"
          value="${rb.exitStop}"
          oninput="updateRouteBackField('exitStop', this.value)"
        />

        <label for="departTimeBack">Departure time</label>
        <input
          id="departTimeBack"
          type="text"
          placeholder="Example: 1:15 PM"
          value="${rb.departTime}"
          oninput="updateRouteBackField('departTime', this.value)"
        />

        <label for="arriveTimeBack">Arrival time</label>
        <input
          id="arriveTimeBack"
          type="text"
          placeholder="Example: 1:42 PM"
          value="${rb.arriveTime}"
          oninput="updateRouteBackField('arriveTime', this.value)"
        />

        <label for="totalTimeBack">Total travel time</label>
        <input
          id="totalTimeBack"
          type="text"
          placeholder="Example: 27 minutes"
          value="${rb.totalTime}"
          oninput="updateRouteBackField('totalTime', this.value)"
        />

        <h3 class="section-title" style="margin-top:24px;">Step 4 - Why are we going?</h3>
        <p>Check all the skills you will practice on this trip.</p>

        <div class="purpose-grid">
          <label class="purpose-item">
            <input
              type="checkbox"
              ${p.lifeSkills ? "checked" : ""}
              onchange="togglePurposeField('lifeSkills', this.checked)"
            />
            Life skills (shopping, ordering, daily living)
          </label>

          <label class="purpose-item">
            <input
              type="checkbox"
              ${p.communityAccess ? "checked" : ""}
              onchange="togglePurposeField('communityAccess', this.checked)"
            />
            Community access and navigation
          </label>

          <label class="purpose-item">
            <input
              type="checkbox"
              ${p.moneySkills ? "checked" : ""}
              onchange="togglePurposeField('moneySkills', this.checked)"
            />
            Money skills (budgeting, paying, change)
          </label>

          <label class="purpose-item">
            <input
              type="checkbox"
              ${p.communication ? "checked" : ""}
              onchange="togglePurposeField('communication', this.checked)"
            />
            Communication and self advocacy
          </label>

          <label class="purpose-item">
            <input
              type="checkbox"
              ${p.socialSkills ? "checked" : ""}
              onchange="togglePurposeField('socialSkills', this.checked)"
            />
            Social skills and teamwork
          </label>

          <label class="purpose-item">
            <input
              type="checkbox"
              ${p.employmentPrep ? "checked" : ""}
              onchange="togglePurposeField('employmentPrep', this.checked)"
            />
            Employment preparation or work skills
          </label>

          <label class="purpose-item">
            <input
              type="checkbox"
              ${p.recreationLeisure ? "checked" : ""}
              onchange="togglePurposeField('recreationLeisure', this.checked)"
            />
            Recreation and leisure in the community
          </label>

          <label class="purpose-item">
            <input
              type="checkbox"
              ${p.safetySkills ? "checked" : ""}
              onchange="togglePurposeField('safetySkills', this.checked)"
            />
            Safety skills (street safety, stranger awareness, etc.)
          </label>
        </div>

        <label for="purposeOther">Other reason</label>
        <input
          id="purposeOther"
          type="text"
          placeholder="Example: practice transfers, volunteer work, special event"
          value="${p.otherText}"
          oninput="updatePurposeOther(this.value)"
        />

        <button class="btn-primary" type="button" onclick="goTo('summary')">
          View Trip summary
        </button>

        <button class="btn-secondary" type="button" onclick="goTo('mapsInstructions')">
          Back to Step 2
        </button>
      </section>
    `;
  }

  // ----------------- WEATHER SCREEN -----------------
  else if (currentScreen === "weather") {
    const w = currentTrip.weather;
    const cityValue = w.city || currentTrip.destinationAddress || "";

    app.innerHTML = `
      <section class="screen" aria-labelledby="weatherTitle">
        <h2 id="weatherTitle">Check Weather for Your Trip</h2>
        <p>Type the city, then choose a weather website. Use what you see to decide what to bring.</p>

        <label for="weatherCity">City or destination</label>
        <input
          id="weatherCity"
          type="text"
          placeholder="Example: Anaheim"
          autocomplete="off"
          value="${cityValue}"
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

        <label for="weatherBring" style="margin-top:20px;">
          Based on this weather, what will you bring?
        </label>
        <textarea
          id="weatherBring"
          placeholder="Example: jacket, umbrella, water, bus pass"
          oninput="updateWeatherWhatToBring(this.value)"
        >${w.whatToBring || ""}</textarea>

        <button class="btn-secondary" type="button" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
  }

  // ----------------- TRIP SUMMARY SCREEN -----------------
  else if (currentScreen === "summary") {
    const r = currentTrip.routeThere;
    const rb = currentTrip.routeBack;
    const pHtml = renderPurposeSummaryList();
    const w = currentTrip.weather;

    app.innerHTML = `
      <section class="screen" aria-labelledby="summaryTitle">
        <h2 id="summaryTitle">Trip summary</h2>
        <p>Review your plan. If something looks wrong, go back and edit the step you need.</p>

        <div class="summary-grid">
          <article class="summary-card">
            <h4>Trip basics</h4>
            <div class="summary-row">
              <span class="summary-label">Destination:</span>
              <span class="summary-value">${currentTrip.destinationName || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Address:</span>
              <span class="summary-value">${currentTrip.destinationAddress || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Date:</span>
              <span class="summary-value">${currentTrip.tripDate || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Meet time:</span>
              <span class="summary-value">${currentTrip.meetTime || "-"}</span>
            </div>
          </article>

          <article class="summary-card">
            <h4>Route there</h4>
            <div class="summary-row">
              <span class="summary-label">Bus number:</span>
              <span class="summary-value">${r.busNumber || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Direction:</span>
              <span class="summary-value">${r.direction || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Get on at:</span>
              <span class="summary-value">${r.boardStop || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Get off at:</span>
              <span class="summary-value">${r.exitStop || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Depart:</span>
              <span class="summary-value">${r.departTime || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Arrive:</span>
              <span class="summary-value">${r.arriveTime || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Total time:</span>
              <span class="summary-value">${r.totalTime || "-"}</span>
            </div>
          </article>

          <article class="summary-card">
            <h4>Route back</h4>
            <div class="summary-row">
              <span class="summary-label">Bus number:</span>
              <span class="summary-value">${rb.busNumber || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Direction:</span>
              <span class="summary-value">${rb.direction || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Get on at:</span>
              <span class="summary-value">${rb.boardStop || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Get off at:</span>
              <span class="summary-value">${rb.exitStop || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Depart:</span>
              <span class="summary-value">${rb.departTime || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Arrive:</span>
              <span class="summary-value">${rb.arriveTime || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Total time:</span>
              <span class="summary-value">${rb.totalTime || "-"}</span>
            </div>
          </article>

          <article class="summary-card">
            <h4>Why are we going?</h4>
            <ul class="summary-list">
              ${pHtml}
            </ul>
          </article>

          <article class="summary-card">
            <h4>Weather and packing</h4>
            <div class="summary-row">
              <span class="summary-label">City looked up:</span>
              <span class="summary-value">${w.city || "-"}</span>
            </div>
            <div style="margin-top:8px; font-size:14px; color:#244b55;">
              <strong>Student plan - what to bring:</strong><br />
              ${w.whatToBring ? w.whatToBring : "Not filled in yet."}
            </div>
          </article>
        </div>

        <button class="btn-primary" type="button" onclick="goTo('planDestination')">
          Edit Step 1 - Basic info
        </button>

        <button class="btn-secondary" type="button" onclick="goTo('routeDetails')">
          Edit Step 3 - Route and purpose
        </button>

        <button class="btn-secondary" type="button" onclick="goTo('weather')">
          Edit weather and packing
        </button>

        <button class="btn-secondary" type="button" onclick="clearCurrentTrip()" style="margin-top:16px;">
          Clear trip and start over
        </button>
      </section>
    `;
  }

  // ----------------- PAST TRIPS PLACEHOLDER -----------------
  else if (currentScreen === "past") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="pastTitle">
        <h2 id="pastTitle">Past trips</h2>
        <p>
          In a future version, this page can show saved trips for each student.
          For now, use this space to talk about trips you already took.
        </p>

        <p class="small-note">
          Idea: Students can write in a paper reflection or a Google Form,
          then you can later connect that data to this screen.
        </p>

        <button class="btn-secondary" type="button" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
  }

  // ----------------- PRACTICE MAPS PLACEHOLDER -----------------
  else if (currentScreen === "practice") {
    app.innerHTML = `
      <section class="screen" aria-labelledby="practiceTitle">
        <h2 id="practiceTitle">Practice using maps</h2>
        <p>
          This screen can be used for practice scenarios before a real CBI trip.
          You might give students a pretend destination and ask them to find a route.
        </p>

        <p class="small-note">
          You can also link practice activities, videos, or worksheets here.
        </p>

        <button class="btn-secondary" type="button" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
  }
}

// =========================================================
// SIDEBAR HIGHLIGHT AND INTERACTION
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

// =========================================================
// INITIALIZE APP
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  // First render, will show auth or home depending on auth state
  render();
  highlightSidebar(currentScreen);

  // Wire sidebar buttons to navigation
  const sidebarItems = document.querySelectorAll(".sidebar-item");
  sidebarItems.forEach(item => {
    const screen = item.getAttribute("data-screen");

    item.addEventListener("click", () => {
      if (screen) {
        goTo(screen);
      }
    });

    // Mouse move glow for fun, not required
    item.addEventListener("mousemove", event => {
      const rect = item.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      item.style.setProperty("--x", `${x}px`);
      item.style.setProperty("--y", `${y}px`);
    });
  });
});
