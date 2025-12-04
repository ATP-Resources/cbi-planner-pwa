// ===== CBI PLANNER STATE =====

let currentScreen = "home";

let currentTrip = {
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
  }
};

// ===== HELPERS TO UPDATE STATE =====

function updateTripField(field, value) {
  currentTrip[field] = value;
}

function updateRouteField(field, value) {
  currentTrip.routeThere[field] = value;
}

function updateRouteBackField(field, value) {
  currentTrip.routeBack[field] = value;
}

function togglePurposeField(field, isChecked) {
  currentTrip.purpose[field] = isChecked;
}

function updatePurposeOther(value) {
  currentTrip.purpose.otherText = value;
}

// Open Google Maps for this trip
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

// Screen navigation
function goTo(screen) {
  currentScreen = screen;
  render();
  highlightSidebar(screen);
}

// ===== RENDER FUNCTION =====

function render() {
  const app = document.getElementById("app");

  if (!app) {
    console.error("App container not found");
    return;
  }

  // HOME SCREEN
  if (currentScreen === "home") {
    app.innerHTML = `
      <div class="screen">
        <h2>Welcome</h2>
        <p>Choose an option below.</p>

        <button class="btn-primary" onclick="goTo('planDestination')">
          Plan a New CBI Trip
        </button>

        <button class="btn-primary" onclick="goTo('past')">
          View My Past Trips
        </button>

        <button class="btn-primary" onclick="goTo('practice')">
          Practice Google Maps
        </button>
      </div>
    `;
  }

  // STEP 1: DESTINATION
  else if (currentScreen === "planDestination") {
    app.innerHTML = `
      <div class="screen">
        <h2>Plan a New CBI Trip</h2>
        <p><strong>Step 1:</strong> Destination and basic information.</p>

        <label for="destName">Destination name</label>
        <input
          id="destName"
          type="text"
          placeholder="Example: Target, Costco, Ayres Hotel"
          value="${currentTrip.destinationName}"
          oninput="updateTripField('destinationName', this.value)"
        />

        <label for="destAddress">Destination address</label>
        <input
          id="destAddress"
          type="text"
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

        <button class="btn-primary" onclick="goTo('mapsInstructions')">
          Go to Step 2: Google Maps Instructions
        </button>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </div>
    `;
  }

  // STEP 2: GOOGLE MAPS INSTRUCTIONS
  else if (currentScreen === "mapsInstructions") {
    app.innerHTML = `
      <div class="screen">
        <h2>Step 2: Use Google Maps</h2>
        <p>Follow these steps to find your bus route.</p>

        <ol class="step-list">
          <li>Check that the <strong>destination name</strong> and <strong>address</strong> in Step 1 are correct.</li>
          <li>Tap the <strong>Open in Google Maps</strong> button below. A new tab or app will open.</li>
          <li>Make sure the <strong>starting point</strong> is your school.</li>
          <li>Change the travel type to <strong>Transit</strong> so you see bus and train routes.</li>
          <li>Look at the routes and choose the one that:
            <ul>
              <li>Arrives on time</li>
              <li>Has the fewest transfers</li>
              <li>Feels easiest for you</li>
            </ul>
          </li>
          <li>Write down or remember:
            <ul>
              <li>Bus number and direction</li>
              <li>First stop where you get on</li>
              <li>Stop where you get off</li>
              <li>Departure time and arrival time</li>
            </ul>
          </li>
          <li>When you are done looking at Google Maps, come back to this CBI Planner app tab to fill in Step 3.</li>
        </ol>

        <button class="btn-primary" onclick="openMapsForCurrentTrip()">
          Open in Google Maps (Transit)
        </button>

        <button class="btn-primary" onclick="goTo('routeDetails')">
          Go to Step 3: Route Details
        </button>

        <button class="btn-secondary" onclick="goTo('planDestination')">
          Back to Step 1
        </button>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </div>
    `;
  }

  // STEP 3: ROUTE DETAILS (THERE + BACK + PURPOSE)
  else if (currentScreen === "routeDetails") {
    const r = currentTrip.routeThere;
    const rb = currentTrip.routeBack;
    const p = currentTrip.purpose;

    app.innerHTML = `
      <div class="screen">
        <h2>Step 3: Route Details</h2>
        <p>Fill this out using the information from Google Maps.</p>

        <h3 class="section-title">Route there</h3>

        <label for="busNumber">Bus number</label>
        <input
          id="busNumber"
          type="text"
          placeholder="Example: Route 47"
          value="${r.busNumber}"
          oninput="updateRouteField('busNumber', this.value)"
        />

        <label for="direction">Direction</label>
        <input
          id="direction"
          type="text"
          placeholder="Example: To Anaheim"
          value="${r.direction}"
          oninput="updateRouteField('direction', this.value)"
        />

        <label for="boardStop">Stop where you get on</label>
        <input
          id="boardStop"
          type="text"
          placeholder="Example: Katella and State College"
          value="${r.boardStop}"
          oninput="updateRouteField('boardStop', this.value)"
        />

        <label for="exitStop">Stop where you get off</label>
        <input
          id="exitStop"
          type="text"
          placeholder="Example: Lincoln and State College"
          value="${r.exitStop}"
          oninput="updateRouteField('exitStop', this.value)"
        />

        <label for="departTime">Departure time</label>
        <input
          id="departTime"
          type="text"
          placeholder="Example: 9:15 AM"
          value="${r.departTime}"
          oninput="updateRouteField('departTime', this.value)"
        />

        <label for="arriveTime">Arrival time</label>
        <input
          id="arriveTime"
          type="text"
          placeholder="Example: 9:42 AM"
          value="${r.arriveTime}"
          oninput="updateRouteField('arriveTime', this.value)"
        />

        <label for="totalTime">Total travel time</label>
        <input
          id="totalTime"
          type="text"
          placeholder="Example: 27 minutes"
          value="${r.totalTime}"
          oninput="updateRouteField('totalTime', this.value)"
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

        <h3 class="section-title" style="margin-top:24px;">Why are we going?</h3>
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
            Communication and self-advocacy
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

        <label for="purposeOther" style="margin-top:12px;">Other reason</label>
        <input
          id="purposeOther"
          type="text"
          placeholder="Example: Practice transfers, volunteer work, special event, etc."
          value="${p.otherText}"
          oninput="updatePurposeOther(this.value)"
        />

        <button class="btn-secondary" onclick="goTo('mapsInstructions')">
          Back to Step 2
        </button>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </div>
    `;
  }

  // PAST TRIPS PLACEHOLDER
  else if (currentScreen === "past") {
    app.innerHTML = `
      <div class="screen">
        <h2>Past Trips</h2>
        <p>Saved trips will show here soon.</p>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </div>
    `;
  }

  // PRACTICE MAPS PLACEHOLDER
  else if (currentScreen === "practice") {
    app.innerHTML = `
      <div class="screen">
        <h2>Practice Google Maps</h2>
        <p>Practice scenarios will appear here.</p>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </div>
    `;
  }
}

// ===== SIDEBAR BEHAVIOR =====

function highlightSidebar(screen) {
  const items = document.querySelectorAll(".sidebar-item");
  items.forEach(btn => {
    const target = btn.getAttribute("data-screen");
    if (target === screen) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // First render
  render();

  // Wire sidebar buttons
  const sidebarItems = document.querySelectorAll(".sidebar-item");
  sidebarItems.forEach(item => {
    const screen = item.getAttribute("data-screen");

    item.addEventListener("click", () => {
      goTo(screen);
    });

    // Light highlight following mouse
    item.addEventListener("mousemove", e => {
      const rect = item.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      item.style.setProperty("--x", `${x}px`);
      item.style.setProperty("--y", `${y}px`);
    });
  });
});
