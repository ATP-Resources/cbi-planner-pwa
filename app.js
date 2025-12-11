// =========================================================
// CBI PLANNER APP LOGIC
// Standard JS, student focused, teacher friendly
// =========================================================

// Current screen name
let currentScreen = "home";

// Main trip state for the current student
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

  // Purpose
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

  // Weather (students interpret)
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
// RESET TRIP STATE
// Clears all fields so a student can start over
// =========================================================

function resetCurrentTrip() {
  // Basic info
  currentTrip.destinationName = "";
  currentTrip.destinationAddress = "";
  currentTrip.tripDate = "";
  currentTrip.meetTime = "";

  // Route there
  currentTrip.routeThere.busNumber = "";
  currentTrip.routeThere.direction = "";
  currentTrip.routeThere.boardStop = "";
  currentTrip.routeThere.exitStop = "";
  currentTrip.routeThere.departTime = "";
  currentTrip.routeThere.arriveTime = "";
  currentTrip.routeThere.totalTime = "";

  // Route back
  currentTrip.routeBack.busNumber = "";
  currentTrip.routeBack.direction = "";
  currentTrip.routeBack.boardStop = "";
  currentTrip.routeBack.exitStop = "";
  currentTrip.routeBack.departTime = "";
  currentTrip.routeBack.arriveTime = "";
  currentTrip.routeBack.totalTime = "";

  // Purpose
  currentTrip.purpose.lifeSkills = false;
  currentTrip.purpose.communityAccess = false;
  currentTrip.purpose.moneySkills = false;
  currentTrip.purpose.communication = false;
  currentTrip.purpose.socialSkills = false;
  currentTrip.purpose.employmentPrep = false;
  currentTrip.purpose.recreationLeisure = false;
  currentTrip.purpose.safetySkills = false;
  currentTrip.purpose.otherText = "";

  // Weather
  currentTrip.weather.city = "";
  currentTrip.weather.tempF = null;
  currentTrip.weather.feelsLikeF = null;
  currentTrip.weather.description = "";
  currentTrip.weather.pop = null;
  currentTrip.weather.whatToBring = "";
}

// Called by the button
function clearTripAndStartOver() {
  const answer = window.confirm(
    "Are you sure you want to clear this trip and start over?"
  );
  if (!answer) return;

  resetCurrentTrip();
  goTo("planDestination");
}

// =========================================================
// GOOGLE MAPS (students still look up details themselves)
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
/* PURPOSE SUMMARY BUILDER */
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
  if (p.safetySkills) items.push("Safety skills (street safety, stranger awareness)");
  if (p.otherText.trim()) items.push(`Other: ${p.otherText.trim()}`);

  if (!items.length) return "<li>No purposes selected yet.</li>";
  return items.map(text => `<li>${text}</li>`).join("");
}

// =========================================================
// WEATHER LOOKUP (OpenWeatherMap API)
// Students type city and interpret data themselves
// =========================================================

// Your API Key - edit this line only
const WEATHER_API_KEY = "PUT_YOUR_API_KEY_HERE";

// Students click Look up weather
async function lookupWeather() {
  const cityInput = document.getElementById("weatherCity");
  const resultsDiv = document.getElementById("weatherResults");
  const bringInput = document.getElementById("weatherBring");

  if (!cityInput || !resultsDiv) return;

  const city = cityInput.value.trim();
  if (!city) {
    alert("Type a city first.");
    return;
  }

  // Clear student answer on new lookup
  if (bringInput) {
    bringInput.value = "";
    updateWeatherWhatToBring("");
  }

  resultsDiv.innerHTML = "Loading weather...";

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
      city
    )}&units=imperial&appid=${WEATHER_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      let message = `Weather lookup failed (status ${response.status}).`;
      const errorData = await response.json().catch(() => null);
      if (errorData && errorData.message) {
        message += ` ${errorData.message}`;
      }
      resultsDiv.innerHTML = message;
      return;
    }

    const data = await response.json();

    const temp = Math.round(data.main.temp);
    const feels = Math.round(data.main.feels_like);
    const description = data.weather[0].description;

    const rainNote =
      data.weather[0].main === "Rain" || data.weather[0].main === "Drizzle"
        ? "Rain is happening or likely now."
        : "No rain reported right now.";

    // Save weather summary
    currentTrip.weather.city = city;
    currentTrip.weather.tempF = temp;
    currentTrip.weather.feelsLikeF = feels;
    currentTrip.weather.description = description;

    resultsDiv.innerHTML = `
      <div class="summary-card">
        <h4>Weather information for ${city}</h4>

        <div class="summary-row">
          <span class="summary-label">Conditions:</span>
          <span class="summary-value">${description}</span>
        </div>

        <div class="summary-row">
          <span class="summary-label">Temperature:</span>
          <span class="summary-value">${temp}°F (feels like ${feels}°F)</span>
        </div>

        <div class="summary-row">
          <span class="summary-label">Rain note:</span>
          <span class="summary-value">${rainNote}</span>
        </div>

        <p class="weather-note">
          Use this information to decide what you should bring.
          The app does not choose for you. You make the plan.
        </p>
      </div>
    `;
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML =
      "Weather could not be loaded. Check your connection or try again.";
  }
}

// =========================================================
// RENDER SCREENS
// =========================================================

function goTo(screenName) {
  currentScreen = screenName;
  render();
  highlightSidebar(screenName);
}

function render() {
  const app = document.getElementById("app");
  if (!app) return;

  // ---------------- HOME ----------------
  if (currentScreen === "home") {
    app.innerHTML = `
      <section class="screen">
        <h2>Welcome</h2>
        <p>Use this planner to get ready for your CBI trip.</p>

        <button class="btn-primary" onclick="goTo('planDestination')">
          Start a new CBI trip
        </button>

        <button class="btn-secondary" onclick="goTo('practice')">
          Practice using Google Maps
        </button>

        <button class="btn-secondary" onclick="clearTripAndStartOver()">
          Clear trip and start over
        </button>
      </section>
    `;
  }

  // ---------------- STEP 1 BASIC INFO ----------------
  else if (currentScreen === "planDestination") {
    app.innerHTML = `
      <section class="screen">
        <h2>Step 1 - Basic info</h2>

        <label>Destination name</label>
        <input
          type="text"
          oninput="updateTripField('destinationName', this.value)"
          value="${currentTrip.destinationName}"
          placeholder="Example: Target"
        />

        <label>Destination address</label>
        <input
          type="text"
          oninput="updateTripField('destinationAddress', this.value)"
          value="${currentTrip.destinationAddress}"
          placeholder="Street, City"
        />

        <label>Date of trip</label>
        <input
          type="date"
          value="${currentTrip.tripDate}"
          oninput="updateTripField('tripDate', this.value)"
        />

        <label>Meet time</label>
        <input
          type="time"
          value="${currentTrip.meetTime}"
          oninput="updateTripField('meetTime', this.value)"
        />

        <button class="btn-primary" onclick="goTo('mapsInstructions')">
          Go to Step 2 - Google Maps steps
        </button>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
  }

  // ---------------- STEP 2 MAP INSTRUCTIONS ----------------
  else if (currentScreen === "mapsInstructions") {
    app.innerHTML = `
      <section class="screen">
        <h2>Step 2 - Google Maps</h2>

        <ol class="step-list">
          <li>Check your destination from Step 1.</li>
          <li>Tap below to open Google Maps in transit mode.</li>
          <li>Review the routes and pick the best one.</li>
          <li>Write down the route details.</li>
        </ol>

        <button class="btn-primary" onclick="openMapsForCurrentTrip()">
          Open in Google Maps (Transit)
        </button>

        <button class="btn-primary" onclick="goTo('routeDetails')">
          Go to Step 3 - Route details
        </button>

        <button class="btn-secondary" onclick="goTo('planDestination')">
          Back to Step 1
        </button>
      </section>
    `;
  }

  // ---------------- STEP 3 ROUTE DETAILS ----------------
  else if (currentScreen === "routeDetails") {
    const r = currentTrip.routeThere;
    const rb = currentTrip.routeBack;
    const p = currentTrip.purpose;

    app.innerHTML = `
      <section class="screen">
        <h2>Step 3 - Route details</h2>
        <p>Use your notes from Google Maps. Type the information yourself.</p>

        <h3>Route there</h3>

        <label>Bus number</label>
        <input
          value="${r.busNumber}"
          oninput="updateRouteThereField('busNumber', this.value)"
        />

        <label>Direction</label>
        <input
          value="${r.direction}"
          oninput="updateRouteThereField('direction', this.value)"
        />

        <label>Stop where you get on</label>
        <input
          value="${r.boardStop}"
          oninput="updateRouteThereField('boardStop', this.value)"
        />

        <label>Stop where you get off</label>
        <input
          value="${r.exitStop}"
          oninput="updateRouteThereField('exitStop', this.value)"
        />

        <label>Departure time</label>
        <input
          value="${r.departTime}"
          oninput="updateRouteThereField('departTime', this.value)"
        />

        <label>Arrival time</label>
        <input
          value="${r.arriveTime}"
          oninput="updateRouteThereField('arriveTime', this.value)"
        />

        <label>Total travel time</label>
        <input
          value="${r.totalTime}"
          oninput="updateRouteThereField('totalTime', this.value)"
        />

        <h3>Route back</h3>

        <label>Bus number</label>
        <input
          value="${rb.busNumber}"
          oninput="updateRouteBackField('busNumber', this.value)"
        />

        <label>Direction</label>
        <input
          value="${rb.direction}"
          oninput="updateRouteBackField('direction', this.value)"
        />

        <label>Stop where you get on</label>
        <input
          value="${rb.boardStop}"
          oninput="updateRouteBackField('boardStop', this.value)"
        />

        <label>Stop where you get off</label>
        <input
          value="${rb.exitStop}"
          oninput="updateRouteBackField('exitStop', this.value)"
        />

        <label>Departure time</label>
        <input
          value="${rb.departTime}"
          oninput="updateRouteBackField('departTime', this.value)"
        />

        <label>Arrival time</label>
        <input
          value="${rb.arriveTime}"
          oninput="updateRouteBackField('arriveTime', this.value)"
        />

        <label>Total travel time</label>
        <input
          value="${rb.totalTime}"
          oninput="updateRouteBackField('totalTime', this.value)"
        />

        <h3>Step 4 - Why are we going?</h3>
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
            Safety skills (street safety, stranger awareness)
          </label>
        </div>

        <label>Other reason</label>
        <input
          type="text"
          placeholder="Example: practice transfers, volunteer work, special event"
          value="${p.otherText}"
          oninput="updatePurposeOther(this.value)"
        />

        <button class="btn-primary" onclick="goTo('summary')">
          View trip summary
        </button>

        <button class="btn-secondary" onclick="goTo('mapsInstructions')">
          Back to Step 2
        </button>
      </section>
    `;
  }

  // ---------------- WEATHER SCREEN ----------------
  else if (currentScreen === "weather") {
    const w = currentTrip.weather;

    app.innerHTML = `
      <section class="screen">
        <h2>Check Weather for Your Trip</h2>

        <label>City or destination</label>
        <input
          id="weatherCity"
          type="text"
          placeholder="Example: Anaheim"
          value="${w.city || ""}"
        />

        <button class="btn-primary" onclick="lookupWeather()">
          Look up weather
        </button>

        <div id="weatherResults" style="margin-top:16px;"></div>

        <label style="margin-top:20px;">
          Based on this weather, what will you bring?
        </label>
        <textarea
          id="weatherBring"
          placeholder="Example: jacket, umbrella, water, bus pass"
          oninput="updateWeatherWhatToBring(this.value)"
        >${w.whatToBring || ""}</textarea>

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
    const pHtml = renderPurposeSummaryList();
    const w = currentTrip.weather;

    app.innerHTML = `
      <section class="screen">
        <h2>Trip summary</h2>
        <p>Review your plan. If something looks wrong, go back and edit the step you need.</p>

        <div class="summary-grid">
          <article class="summary-card">
            <h4>Trip basics</h4>
            <p>Destination: ${currentTrip.destinationName || "-"}</p>
            <p>Address: ${currentTrip.destinationAddress || "-"}</p>
            <p>Date: ${currentTrip.tripDate || "-"}</p>
            <p>Meet time: ${currentTrip.meetTime || "-"}</p>
          </article>

          <article class="summary-card">
            <h4>Route there</h4>
            <p>Bus: ${r.busNumber || "-"}</p>
            <p>Direction: ${r.direction || "-"}</p>
            <p>Get on: ${r.boardStop || "-"}</p>
            <p>Get off: ${r.exitStop || "-"}</p>
            <p>Depart: ${r.departTime || "-"}</p>
            <p>Arrive: ${r.arriveTime || "-"}</p>
            <p>Total: ${r.totalTime || "-"}</p>
          </article>

          <article class="summary-card">
            <h4>Route back</h4>
            <p>Bus: ${rb.busNumber || "-"}</p>
            <p>Direction: ${rb.direction || "-"}</p>
            <p>Get on: ${rb.boardStop || "-"}</p>
            <p>Get off: ${rb.exitStop || "-"}</p>
            <p>Depart: ${rb.departTime || "-"}</p>
            <p>Arrive: ${rb.arriveTime || "-"}</p>
            <p>Total: ${rb.totalTime || "-"}</p>
          </article>

          <article class="summary-card">
            <h4>Purposes</h4>
            <ul>${pHtml}</ul>
          </article>

          <article class="summary-card">
            <h4>Weather</h4>
            <p>City: ${w.city || "-"}</p>
            <p>Conditions: ${w.description || "-"}</p>
            <p>Temperature: ${w.tempF != null ? w.tempF + "°F" : "-"}</p>
            <p><strong>Student plan:</strong> ${w.whatToBring || "-"}</p>
          </article>
        </div>

        <button class="btn-primary" onclick="goTo('planDestination')">
          Edit Step 1 - Basic info
        </button>

        <button class="btn-secondary" onclick="goTo('routeDetails')">
          Edit Step 3 - Route and purpose
        </button>

        <button class="btn-secondary" onclick="goTo('weather')">
          Edit weather and packing
        </button>

        <button class="btn-secondary" onclick="clearTripAndStartOver()">
          Clear trip and start over
        </button>
      </section>
    `;
  }

  // ---------------- PAST TRIPS PLACEHOLDER ----------------
  else if (currentScreen === "past") {
    app.innerHTML = `
      <section class="screen">
        <h2>Past trips</h2>
        <p>
          In a future version, this page can show saved trips for each student.
          For now, use this space to talk about trips you already took.
        </p>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
  }

  // ---------------- PRACTICE ----------------
  else if (currentScreen === "practice") {
    app.innerHTML = `
      <section class="screen">
        <h2>Practice using maps</h2>
        <p>Try planning a pretend trip to build confidence.</p>
        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </section>
    `;
  }
}

// =========================================================
// SIDEBAR HIGHLIGHT
// =========================================================

function highlightSidebar(screenName) {
  const items = document.querySelectorAll(".sidebar-item");
  items.forEach(btn => {
    const target = btn.getAttribute("data-screen");
    btn.classList.toggle("active", target === screenName);
  });
}

// =========================================================
// INITIAL LOAD
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  render();
  highlightSidebar(currentScreen);

  // Sidebar click navigation
  document.querySelectorAll(".sidebar-item").forEach(item => {
    const screen = item.getAttribute("data-screen");
    item.addEventListener("click", () => {
      if (screen) goTo(screen);
    });

    // Optional glow effect if you kept the CSS variables
    item.addEventListener("mousemove", event => {
      const rect = item.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      item.style.setProperty("--x", `${x}px`);
      item.style.setProperty("--y", `${y}px`);
    });
  });
});
