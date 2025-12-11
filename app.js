// =========================================================
// CBI PLANNER APP LOGIC
// Standard JS, student-friendly, teacher-friendly
// =========================================================

// -------------------------------
// Current screen
// -------------------------------
let currentScreen = "home";

// -------------------------------
// Main trip state for the student
// -------------------------------
const currentTrip = {
  // Step 1 - basic info
  destinationName: "",
  destinationAddress: "",
  tripDate: "",
  meetTime: "",

  // Step 3 - route there
  routeThere: {
    busNumber: "",
    direction: "",
    boardStop: "",
    exitStop: "",
    departTime: "",
    arriveTime: "",
    totalTime: ""
  },

  // Step 3 - route back
  routeBack: {
    busNumber: "",
    direction: "",
    boardStop: "",
    exitStop: "",
    departTime: "",
    arriveTime: "",
    totalTime: ""
  },

  // Step 4 - purpose (skills practiced)
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

  // Weather — student-interpretation focused
  weather: {
    city: "",
    tempF: null,
    feelsLikeF: null,
    description: "",
    pop: null,
    whatToBring: ""
  }
};

// =========================================================
// HELPER FUNCTIONS TO UPDATE STATE
// =========================================================

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

function updateWeatherWhatToBring(value) {
  currentTrip.weather.whatToBring = value;
}

// =========================================================
// GOOGLE MAPS LAUNCHER — students still read & copy details
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
// PURPOSE SUMMARY BUILDER FOR SUMMARY SCREEN
// =========================================================

function renderPurposeSummaryList() {
  const p = currentTrip.purpose;
  const list = [];

  if (p.lifeSkills) list.push("Life skills (shopping, ordering, daily living)");
  if (p.communityAccess) list.push("Community access and navigation");
  if (p.moneySkills) list.push("Money skills (budgeting, paying, change)");
  if (p.communication) list.push("Communication and self advocacy");
  if (p.socialSkills) list.push("Social skills and teamwork");
  if (p.employmentPrep) list.push("Employment preparation or work skills");
  if (p.recreationLeisure) list.push("Recreation and leisure in the community");
  if (p.safetySkills) list.push("Safety skills (street safety, stranger awareness)");
  if (p.otherText.trim() !== "") list.push("Other: " + p.otherText.trim());

  if (!list.length) {
    return "<li>No purposes selected yet.</li>";
  }

  return list.map(item => `<li>${item}</li>`).join("");
}

// =========================================================
// WEATHER LOOKUP — Using OpenWeatherMap
// Students interpret — NOT auto decision-making
// =========================================================

// IMPORTANT — Your actual API key (now fixed with quotes)
const WEATHER_API_KEY = "f9715f76f28be705da13c53ab5fcc2c5";

// Called when student clicks “Look up weather”
async function lookupWeather() {
  const cityInput = document.getElementById("weatherCity");
  const resultsDiv = document.getElementById("weatherResults");
  const bringInput = document.getElementById("weatherBring");

  if (!cityInput || !resultsDiv) return;

  const city = cityInput.value.trim();
  if (!city) {
    alert("Type a city or destination first.");
    return;
  }

  // Reset student packing notes on new lookup
  if (bringInput) {
    bringInput.value = "";
    updateWeatherWhatToBring("");
  }

  resultsDiv.innerHTML = "Loading weather...";

  try {
    // Using CURRENT weather endpoint — simpler for students
    const url =
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}` +
      `&units=imperial&appid=${WEATHER_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      let msg = `Weather lookup failed (status ${response.status}).`;
      try {
        const errJSON = await response.json();
        if (errJSON?.message) msg += " " + errJSON.message;
      } catch {}
      resultsDiv.innerHTML = msg;
      return;
    }

    const data = await response.json();

    if (!data.main || !data.weather?.length) {
      resultsDiv.innerHTML = "No weather data found.";
      return;
    }

    const temp = Math.round(data.main.temp);
    const feels = Math.round(data.main.feels_like);
    const desc = data.weather[0].description;

    // Save to trip so teacher can later view it
    currentTrip.weather.city = city;
    currentTrip.weather.tempF = temp;
    currentTrip.weather.feelsLikeF = feels;
    currentTrip.weather.description = desc;

    // Light interpretation text
    const rainText =
      data.weather[0].main === "Rain" || data.weather[0].main === "Drizzle"
        ? "Rain is happening or very likely right now."
        : "No rain reported right now.";

    // Display card
    resultsDiv.innerHTML = `
      <div class="summary-card">
        <h4>Weather for ${city}</h4>

        <div class="summary-row">
          <span class="summary-label">Conditions:</span>
          <span class="summary-value">${desc}</span>
        </div>

        <div class="summary-row">
          <span class="summary-label">Temperature:</span>
          <span class="summary-value">${temp}°F (feels like ${feels}°F)</span>
        </div>

        <div class="summary-row">
          <span class="summary-label">Rain:</span>
          <span class="summary-value">${rainText}</span>
        </div>

        <p class="weather-note">
          Use this information to decide what YOU should bring.
          The app does not choose for you.
        </p>
      </div>
    `;
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML =
      "Unable to load weather. Check your internet connection and try again.";
  }
}

// =========================================================
// ROUTING LOGIC — switch screens
// =========================================================

function goTo(screen) {
  currentScreen = screen;
  render();
  highlightSidebar(screen);
}

// =========================================================
// RENDER FUNCTION — loads correct screen into #app
// =========================================================

function render() {
  const app = document.getElementById("app");
  if (!app) return;

  // ---------------- HOME ----------------
  if (currentScreen === "home") {
    app.innerHTML = `
      <section class="screen">
        <h2>Welcome</h2>
        <p>Use this CBI Planner to prepare for your community-based instruction trip.</p>

        <p class="small-note">
          You will use Google Maps, read information, and type your answers.
          The app does not do the planning for you.
        </p>

        <button class="btn-primary" onclick="goTo('planDestination')">
          Start a new CBI trip
        </button>

        <button class="btn-secondary" onclick="goTo('practice')">
          Practice Maps
        </button>
      </section>
    `;
  }

  // ---------------- STEP 1 — BASIC INFO ----------------
  else if (currentScreen === "planDestination") {
    app.innerHTML = `
      <section class="screen">
        <h2>Step 1 — Basic info</h2>
        <p>Enter the basic information for your trip.</p>

        <label for="destName">Destination name</label>
        <input id="destName" type="text" value="${currentTrip.destinationName}"
          placeholder="Example: Target, Costco, Ayres Hotel"
          oninput="updateTripField('destinationName', this.value)" />

        <label for="destAddress">Destination address</label>
        <input id="destAddress" type="text" value="${currentTrip.destinationAddress}"
          placeholder="Street, city, state"
          oninput="updateTripField('destinationAddress', this.value)" />

        <label for="tripDate">Trip date</label>
        <input id="tripDate" type="date" value="${currentTrip.tripDate}"
          oninput="updateTripField('tripDate', this.value)" />

        <label for="meetTime">Meet time</label>
        <input id="meetTime" type="time" value="${currentTrip.meetTime}"
          oninput="updateTripField('meetTime', this.value)" />

        <button class="btn-primary" onclick="goTo('mapsInstructions')">
          Go to Step 2 — Google Maps
        </button>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
  }

  // ---------------- STEP 2 — GOOGLE MAPS ----------------
  else if (currentScreen === "mapsInstructions") {
    app.innerHTML = `
      <section class="screen">
        <h2>Step 2 — Use Google Maps</h2>

        <ol class="step-list">
          <li>Check that Step 1 information is correct.</li>
          <li>Tap the button below to open Google Maps.</li>
          <li>Select the best bus route based on:
            <ul>
              <li>Arrival time</li>
              <li>Transfers</li>
              <li>Ease of following</li>
            </ul>
          </li>
          <li>Write down all route details.</li>
          <li>Return here and continue to Step 3.</li>
        </ol>

        <button class="btn-primary" onclick="openMapsForCurrentTrip()">
          Open Google Maps (Transit)
        </button>

        <button class="btn-primary" onclick="goTo('routeDetails')">
          Go to Step 3 — Route details
        </button>

        <button class="btn-secondary" onclick="goTo('planDestination')">
          Back to Step 1
        </button>
      </section>
    `;
  }

  // ---------------- STEP 3 — ROUTE DETAILS ----------------
  else if (currentScreen === "routeDetails") {
    const r = currentTrip.routeThere;
    const rb = currentTrip.routeBack;

    app.innerHTML = `
      <section class="screen">
        <h2>Step 3 — Route details</h2>

        <h3 class="section-title">Route there</h3>

        <label>Bus number</label>
        <input type="text" value="${r.busNumber}"
          oninput="updateRouteThereField('busNumber', this.value)" />

        <label>Direction</label>
        <input type="text" value="${r.direction}"
          oninput="updateRouteThereField('direction', this.value)" />

        <label>Stop where you get on</label>
        <input type="text" value="${r.boardStop}"
          oninput="updateRouteThereField('boardStop', this.value)" />

        <label>Stop where you get off</label>
        <input type="text" value="${r.exitStop}"
          oninput="updateRouteThereField('exitStop', this.value)" />

        <label>Departure time</label>
        <input type="text" value="${r.departTime}"
          oninput="updateRouteThereField('departTime', this.value)" />

        <label>Arrival time</label>
        <input type="text" value="${r.arriveTime}"
          oninput="updateRouteThereField('arriveTime', this.value)" />

        <label>Total travel time</label>
        <input type="text" value="${r.totalTime}"
          oninput="updateRouteThereField('totalTime', this.value)" />

        <h3 class="section-title" style="margin-top:24px;">Route back</h3>

        <label>Bus number</label>
        <input type="text" value="${rb.busNumber}"
          oninput="updateRouteBackField('busNumber', this.value)" />

        <label>Direction</label>
        <input type="text" value="${rb.direction}"
          oninput="updateRouteBackField('direction', this.value)" />

        <label>Stop where you get on</label>
        <input type="text" value="${rb.boardStop}"
          oninput="updateRouteBackField('boardStop', this.value)" />

        <label>Stop where you get off</label>
        <input type="text" value="${rb.exitStop}"
          oninput="updateRouteBackField('exitStop', this.value)" />

        <label>Departure time</label>
        <input type="text" value="${rb.departTime}"
          oninput="updateRouteBackField('departTime', this.value)" />

        <label>Arrival time</label>
        <input type="text" value="${rb.arriveTime}"
          oninput="updateRouteBackField('arriveTime', this.value)" />

        <label>Total travel time</label>
        <input type="text" value="${rb.totalTime}"
          oninput="updateRouteBackField('totalTime', this.value)" />

        <h3 class="section-title" style="margin-top:24px;">Step 4 — Why are we going?</h3>
        ${renderPurposeChecklist()}

        <button class="btn-primary" onclick="goTo('summary')">
          View Trip summary
        </button>

        <button class="btn-secondary" onclick="goTo('mapsInstructions')">
          Back to Step 2
        </button>
      </section>
    `;
  }

  // ---------------- WEATHER ----------------
  else if (currentScreen === "weather") {
    const w = currentTrip.weather;

    app.innerHTML = `
      <section class="screen">
        <h2>Check Weather for Your Trip</h2>

        <label for="weatherCity">City or destination</label>
        <input id="weatherCity" type="text"
          value="${w.city || currentTrip.destinationAddress || ""}"
          placeholder="Example: Anaheim, CA" />

        <button class="btn-primary" onclick="lookupWeather()">
          Look up weather
        </button>

        <div id="weatherResults" style="margin-top:16px;"></div>

        <label for="weatherBring" style="margin-top:20px;">
          Based on this weather, what will you bring?
        </label>
        <textarea id="weatherBring"
          placeholder="Example: jacket, umbrella, water, bus pass"
          oninput="updateWeatherWhatToBring(this.value)">${w.whatToBring || ""}</textarea>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
  }

  // ---------------- SUMMARY ----------------
  else if (currentScreen === "summary") {
    const r = currentTrip.routeThere;
    const rb = currentTrip.routeBack;
    const pList = renderPurposeSummaryList();
    const w = currentTrip.weather;

    app.innerHTML = `
      <section class="screen">
        <h2>Trip summary</h2>

        <div class="summary-grid">
          <article class="summary-card">
            <h4>Trip basics</h4>
            <div class="summary-row"><span>Destination:</span> <span>${currentTrip.destinationName || "-"}</span></div>
            <div class="summary-row"><span>Address:</span> <span>${currentTrip.destinationAddress || "-"}</span></div>
            <div class="summary-row"><span>Date:</span> <span>${currentTrip.tripDate || "-"}</span></div>
            <div class="summary-row"><span>Meet time:</span> <span>${currentTrip.meetTime || "-"}</span></div>
          </article>

          <article class="summary-card">
            <h4>Route there</h4>
            <div class="summary-row"><span>Bus #:</span> <span>${r.busNumber || "-"}</span></div>
            <div class="summary-row"><span>Direction:</span> <span>${r.direction || "-"}</span></div>
            <div class="summary-row"><span>Get on at:</span> <span>${r.boardStop || "-"}</span></div>
            <div class="summary-row"><span>Get off at:</span> <span>${r.exitStop || "-"}</span></div>
            <div class="summary-row"><span>Depart:</span> <span>${r.departTime || "-"}</span></div>
            <div class="summary-row"><span>Arrive:</span> <span>${r.arriveTime || "-"}</span></div>
            <div class="summary-row"><span>Total time:</span> <span>${r.totalTime || "-"}</span></div>
          </article>

          <article class="summary-card">
            <h4>Route back</h4>
            <div class="summary-row"><span>Bus #:</span> <span>${rb.busNumber || "-"}</span></div>
            <div class="summary-row"><span>Direction:</span> <span>${rb.direction || "-"}</span></div>
            <div class="summary-row"><span>Get on at:</span> <span>${rb.boardStop || "-"}</span></div>
            <div class="summary-row"><span>Get off at:</span> <span>${rb.exitStop || "-"}</span></div>
            <div class="summary-row"><span>Depart:</span> <span>${rb.departTime || "-"}</span></div>
            <div class="summary-row"><span>Arrive:</span> <span>${rb.arriveTime || "-"}</span></div>
            <div class="summary-row"><span>Total time:</span> <span>${rb.totalTime || "-"}</span></div>
          </article>

          <article class="summary-card">
            <h4>Why are we going?</h4>
            <ul class="summary-list">${pList}</ul>
          </article>

          <article class="summary-card">
            <h4>Weather & Packing</h4>
            <div class="summary-row"><span>City:</span> <span>${w.city || "-"}</span></div>
            <div class="summary-row"><span>Conditions:</span> <span>${w.description || "-"}</span></div>
            <div class="summary-row"><span>Temperature:</span> <span>${w.tempF != null ? `${w.tempF}°F` : "-"}</span></div>
            <div class="summary-row" style="margin-top:8px; flex-direction:column; align-items:flex-start;">
              <strong>Student plan — What to bring:</strong>
              <span>${w.whatToBring || "Not filled in yet."}</span>
            </div>
          </article>
        </div>

        <button class="btn-primary" onclick="goTo('planDestination')">
          Edit Step 1
        </button>
        <button class="btn-secondary" onclick="goTo('routeDetails')">
          Edit Step 3
        </button>
        <button class="btn-secondary" onclick="goTo('weather')">
          Edit Weather
        </button>
      </section>
    `;
  }

  // ---------------- PRACTICE ----------------
  else if (currentScreen === "practice") {
    app.innerHTML = `
      <section class="screen">
        <h2>Practice using Maps</h2>

        <p>
          You can practice reading maps, finding bus routes,
          and taking notes here before doing a real CBI trip.
        </p>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
  }
}

// =========================================================
// SIDEBAR HIGHLIGHTING
// =========================================================

function highlightSidebar(screenName) {
  const items = document.querySelectorAll(".sidebar-item");
  items.forEach(item => {
    const target = item.getAttribute("data-screen");
    if (target === screenName) {
      item.classList.add("active");
      item.setAttribute("aria-current", "page");
    } else {
      item.classList.remove("active");
      item.removeAttribute("aria-current");
    }
  });
}

// =========================================================
// INITIALIZE APP
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  render();
  highlightSidebar(currentScreen);

  // Sidebar navigation
  const items = document.querySelectorAll(".sidebar-item");
  items.forEach(item => {
    const screen = item.getAttribute("data-screen");

    item.addEventListener("click", () => {
      if (screen) goTo(screen);
    });

    // Hover glow effect
    item.addEventListener("mousemove", e => {
      const rect = item.getBoundingClientRect();
      item.style.setProperty("--x", `${e.clientX - rect.left}px`);
      item.style.setProperty("--y", `${e.clientY - rect.top}px`);
    });
  });
});
vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
