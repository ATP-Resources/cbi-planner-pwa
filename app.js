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

  // Step 4 - purpose of trip
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

  // Weather notes - students interpret weather themselves
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
// GOOGLE MAPS INTEGRATION
// Opens transit directions only - students still copy details
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
// PURPOSE SUMMARY BUILDER
// Used in the Trip Summary screen
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
// WEATHER LOOKUP USING OPENWEATHERMAP
// Students type the city and interpret the results
// =========================================================

// Paste your own OpenWeatherMap API key here
// Sign up at https://openweathermap.org/ for a free key
const WEATHER_API_KEY = "YOUR_OPENWEATHERMAP_API_KEY_HERE";

// Students click the "Look up weather" button
async function lookupWeather() {
  const cityInput = document.getElementById("weatherCity");
  const resultsDiv = document.getElementById("weatherResults");
  const bringInput = document.getElementById("weatherBring");

  if (!cityInput || !resultsDiv) {
    return;
  }

  const city = cityInput.value.trim();

  if (!city) {
    alert("Type a city or destination first.");
    return;
  }

  // Clear any previous student answer when doing a new lookup
  if (bringInput) {
    bringInput.value = "";
    updateWeatherWhatToBring("");
  }

  resultsDiv.innerHTML = "Loading weather...";

  try {
    // Use simpler "current weather" endpoint
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
      city
    )}&units=imperial&appid=${WEATHER_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      // Try to read error message from API
      let message = `Weather lookup failed (status ${response.status}).`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          message += ` ${errorData.message}`;
        }
      } catch (e) {
        // ignore JSON parse error
      }
      resultsDiv.innerHTML = message;
      return;
    }

    const data = await response.json();

    if (!data.main || !data.weather || !data.weather.length) {
      resultsDiv.innerHTML = "No weather data found for that location.";
      return;
    }

    const temp = Math.round(data.main.temp);
    const feels = Math.round(data.main.feels_like);
    const description = data.weather[0].description;

    // This endpoint does not give a percent chance of rain.
    // You can use this as a reading discussion instead.
    const popText =
      data.weather[0].main === "Rain" || data.weather[0].main === "Drizzle"
        ? "Rain is happening or very likely now."
        : "No rain reported right now.";

    // Save into trip state so teacher can see later
    currentTrip.weather.city = city;
    currentTrip.weather.tempF = temp;
    currentTrip.weather.feelsLikeF = feels;
    currentTrip.weather.description = description;
    currentTrip.weather.pop = null;

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
          <span class="summary-value">${popText}</span>
        </div>
        <p class="weather-note">
          Use this information to decide what you should bring on your CBI trip.
          The app does not choose for you. You make the plan.
        </p>
      </div>
    `;
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML =
      "Sorry, we could not load the weather. Check your internet connection or try again.";
  }
}

// =========================================================
// SCREEN RENDERING
// Renders the correct screen into the #app container
// =========================================================

function goTo(screenName) {
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

        <button class="btn-primary" type="button" onclick="goTo('planDestination')">
          Start a new CBI trip
        </button>

        <button class="btn-secondary" type="button" onclick="goTo('practice')">
          Practice using Google Maps first
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

    app.innerHTML = `
      <section class="screen" aria-labelledby="weatherTitle">
        <h2 id="weatherTitle">Check Weather for Your Trip</h2>
        <p>Use this screen to look up the weather for your CBI destination.</p>

        <label for="weatherCity">City or destination</label>
        <input
          id="weatherCity"
          type="text"
          placeholder="Example: Anaheim, CA"
          autocomplete="off"
          value="${w.city || currentTrip.destinationAddress || ""}"
        />

        <button class="btn-primary" type="button" onclick="lookupWeather()">
          Look up weather
        </button>

        <div id="weatherResults" style="margin-top:16px;"></div>

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
            <div class="summary-row">
              <span class="summary-label">Conditions:</span>
              <span class="summary-value">${w.description || "-"}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Temperature:</span>
              <span class="summary-value">${
                w.tempF != null ? `${w.tempF}°F` : "-"
              }</span>
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
  // First render
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

    // Mouse move glow for fun but not required
    item.addEventListener("mousemove", event => {
      const rect = item.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      item.style.setProperty("--x", `${x}px`);
      item.style.setProperty("--y", `${y}px`);
    });
  });
});
