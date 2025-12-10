 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/app.js b/app.js
index 7344e4c00c046987ca70cffb8f89fb7fa4f91949..05b2c3b56f75d32ed1a6c206179a69594015958a 100644
--- a/app.js
+++ b/app.js
@@ -1,343 +1,514 @@
 // =========================================================
 //  WEATHER API KEY
 // =========================================================
 
 const WEATHER_API_KEY = "f9715f7f6f28be705da13c53ab5fcc2c5";
 
 // =========================================================
 //  CBI PLANNER STATE
 // =========================================================
 
-let currentScreen = "home";
-
-let currentTrip = {
-  destinationName: "",
-  destinationAddress: "",
-  tripDate: "",
-  meetTime: "",
-  routeThere: {
-    busNumber: "",
-    direction: "",
-    boardStop: "",
+let currentScreen = "home";
+
+let currentUser = loadUserFromStorage();
+let savedTrips = loadTripsFromStorage();
+
+let currentTrip = {
+  destinationName: "",
+  destinationAddress: "",
+  tripDate: "",
+  meetTime: "",
+  weatherPlan: {
+    city: "",
+    forecast: null,
+    packingChoices: {
+      jacket: false,
+      umbrella: false,
+      sunscreen: false,
+      waterBottle: false,
+      hat: false
+    },
+    packingNotes: ""
+  },
+  routeThere: {
+    busNumber: "",
+    direction: "",
+    boardStop: "",
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
   safety: {
     moneyNeeded: "",
     safetyRules: "",
     packingChecklist: {
       jacket: false,
       water: false,
       busFare: false,
       snack: false,
       phone: false,
       idCard: false
     },
     packingOther: ""
   },
-  reflection: {
-    wentAsPlanned: "",
-    easyPart: "",
-    hardPart: "",
-    nextTime: ""
-  }
-};
+  reflection: {
+    wentAsPlanned: "",
+    easyPart: "",
+    hardPart: "",
+    nextTime: ""
+  }
+};
+
+// =========================================================
+//  LOCAL STORAGE HELPERS
+// =========================================================
+
+function loadTripsFromStorage() {
+  try {
+    const raw = localStorage.getItem("cbiSavedTrips");
+    return raw ? JSON.parse(raw) : [];
+  } catch (err) {
+    console.error("Unable to load saved trips", err);
+    return [];
+  }
+}
+
+function persistTrips() {
+  localStorage.setItem("cbiSavedTrips", JSON.stringify(savedTrips));
+}
+
+function loadUserFromStorage() {
+  try {
+    const raw = localStorage.getItem("cbiCurrentUser");
+    return raw ? JSON.parse(raw) : null;
+  } catch (err) {
+    console.error("Unable to load user", err);
+    return null;
+  }
+}
+
+function persistUser(user) {
+  currentUser = user;
+  if (user) {
+    localStorage.setItem("cbiCurrentUser", JSON.stringify(user));
+  } else {
+    localStorage.removeItem("cbiCurrentUser");
+  }
+}
 
 // =========================================================
 //  HELPERS TO UPDATE STATE
 // =========================================================
 
-function updateTripField(field, value) {
-  currentTrip[field] = value;
-}
+function updateTripField(field, value) {
+  currentTrip[field] = value;
+}
+
+function updateWeatherPlanField(field, value) {
+  currentTrip.weatherPlan[field] = value;
+}
+
+function toggleWeatherPacking(item, isChecked) {
+  currentTrip.weatherPlan.packingChoices[item] = isChecked;
+}
 
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
 
 function updateSafetyField(field, value) {
   currentTrip.safety[field] = value;
 }
 
 function togglePackingItem(field, isChecked) {
   currentTrip.safety.packingChecklist[field] = isChecked;
 }
 
 function updatePackingOther(value) {
   currentTrip.safety.packingOther = value;
 }
 
-function updateReflectionField(field, value) {
-  currentTrip.reflection[field] = value;
-}
+function updateReflectionField(field, value) {
+  currentTrip.reflection[field] = value;
+}
+
+// =========================================================
+//  LOGIN & SAVED TRIPS
+// =========================================================
+
+function handleLogin() {
+  const nameInput = document.getElementById("loginName");
+  const roleSelect = document.getElementById("loginRole");
+
+  if (!nameInput || !roleSelect) return;
+
+  const name = nameInput.value.trim();
+  const role = roleSelect.value;
+
+  if (!name) {
+    alert("Enter your name to sign in.");
+    return;
+  }
+
+  persistUser({ name, role });
+  alert(`Signed in as ${name} (${role}).`);
+  goTo(role === "teacher" ? "teacher" : "studentDashboard");
+}
+
+function handleLogout() {
+  persistUser(null);
+  alert("You are signed out.");
+  goTo("home");
+}
+
+function saveCurrentTrip() {
+  if (!currentUser || currentUser.role !== "student") {
+    alert("Sign in as a student to save this trip.");
+    goTo("login");
+    return;
+  }
+
+  const tripRecord = {
+    id: Date.now().toString(),
+    studentName: currentUser.name,
+    createdAt: new Date().toISOString(),
+    data: JSON.parse(JSON.stringify(currentTrip))
+  };
+
+  savedTrips.push(tripRecord);
+  persistTrips();
+
+  alert("Trip saved for your dashboard and teacher view.");
+  goTo("studentDashboard");
+}
+
+function formatDate(isoString) {
+  const date = new Date(isoString);
+  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
+}
 
 // =========================================================
 //  GOOGLE MAPS OPEN
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
 //  PURPOSE SUMMARY (FOR SUMMARY SCREEN)
 // =========================================================
 
-function renderPurposeSummary() {
-  const p = currentTrip.purpose;
-  const items = [];
+function renderPurposeSummary() {
+  const p = currentTrip.purpose;
+  const items = [];
 
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
     items.push("Communication and self-advocacy");
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
     items.push("Other: " + p.otherText.trim());
   }
 
   if (!items.length) {
     return "<li>No purposes selected yet.</li>";
   }
 
   return items.map(text => `<li>${text}</li>`).join("");
 }
 
-function renderPackingSummary() {
-  const pc = currentTrip.safety.packingChecklist;
-  const labelMap = {
-    jacket: "Jacket or sweater",
-    water: "Water bottle",
+function renderPackingSummary() {
+  const pc = currentTrip.safety.packingChecklist;
+  const labelMap = {
+    jacket: "Jacket or sweater",
+    water: "Water bottle",
     busFare: "Bus fare or bus pass",
     snack: "Snack or lunch",
     phone: "Charged phone",
     idCard: "ID card or school ID"
   };
 
   const items = [];
 
   Object.keys(labelMap).forEach(key => {
     if (pc[key]) {
       items.push(labelMap[key]);
     }
   });
 
   if (currentTrip.safety.packingOther.trim() !== "") {
     items.push("Other: " + currentTrip.safety.packingOther.trim());
   }
 
   if (!items.length) {
     return "<li>No items selected yet.</li>";
   }
-
-  return items.map(text => `<li>${text}</li>`).join("");
-}
+
+  return items.map(text => `<li>${text}</li>`).join("");
+}
+
+function renderPurposeSummaryFromData(tripData) {
+  const p = tripData.purpose || {};
+  const items = [];
+
+  if (p.lifeSkills) items.push("Life skills");
+  if (p.communityAccess) items.push("Community access");
+  if (p.moneySkills) items.push("Money skills");
+  if (p.communication) items.push("Communication");
+  if (p.socialSkills) items.push("Social skills");
+  if (p.employmentPrep) items.push("Employment prep");
+  if (p.recreationLeisure) items.push("Recreation/leisure");
+  if (p.safetySkills) items.push("Safety skills");
+  if (p.otherText && p.otherText.trim()) items.push(`Other: ${p.otherText.trim()}`);
+
+  return items.join(", ") || "(none)";
+}
+
+function renderWeatherPackingSummary() {
+  const pc = currentTrip.weatherPlan.packingChoices;
+  const labelMap = {
+    jacket: "Jacket or sweater",
+    umbrella: "Umbrella or raincoat",
+    sunscreen: "Sunscreen",
+    waterBottle: "Water bottle",
+    hat: "Hat or sun protection"
+  };
+
+  const items = Object.keys(labelMap)
+    .filter(key => pc[key])
+    .map(key => labelMap[key]);
+
+  if (currentTrip.weatherPlan.packingNotes.trim() !== "") {
+    items.push(`Notes: ${currentTrip.weatherPlan.packingNotes.trim()}`);
+  }
+
+  if (!items.length) {
+    return "<li>No weather-based packing decisions recorded yet.</li>";
+  }
+
+  return items.map(text => `<li>${text}</li>`).join("");
+}
 
 // =========================================================
 //  NAVIGATION
 // =========================================================
 
 function goTo(screen) {
   currentScreen = screen;
   render();
   highlightSidebar(screen);
 }
 
 // =========================================================
 //  WEATHER LOOKUP
 //  (Read and interpret only, no auto packing)
 // =========================================================
 
 async function lookupWeather() {
-  const cityInput = document.getElementById("weatherCity");
-  const resultsDiv = document.getElementById("weatherResults");
-
-  if (!cityInput || !resultsDiv) return;
-
-  const city = cityInput.value.trim();
+  const cityInput = document.getElementById("weatherCity");
+  const resultsDiv = document.getElementById("weatherResults");
+
+  if (!cityInput || !resultsDiv) return;
+
+  const city = cityInput.value.trim();
 
   if (!city) {
     alert("Type a city or destination first.");
     return;
   }
 
-  resultsDiv.innerHTML = "Loading weather...";
-
-  try {
-    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
-      city
+  resultsDiv.innerHTML = "Loading weather...";
+
+  try {
+    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
+      city
     )}&units=imperial&appid=${WEATHER_API_KEY}`;
 
     const response = await fetch(url);
     if (!response.ok) {
       throw new Error("Weather lookup failed");
     }
 
-    const data = await response.json();
+    const data = await response.json();
 
     if (!data.list || !data.list.length) {
       resultsDiv.innerHTML = "No forecast found for that location.";
       return;
     }
 
-    const first = data.list[0];
-
-    const temp = Math.round(first.main.temp);
-    const feels = Math.round(first.main.feels_like);
-    const description = first.weather[0].description;
-    const pop = Math.round((first.pop || 0) * 100);
-
-    resultsDiv.innerHTML = `
-      <div class="summary-card">
-        <h4>Forecast for ${city}</h4>
-        <div class="summary-row">
-          <span class="summary-label">Conditions:</span>
-          <span class="summary-value">${description}</span>
-        </div>
-        <div class="summary-row">
-          <span class="summary-label">Temperature:</span>
-          <span class="summary-value">${temp}°F (feels like ${feels}°F)</span>
-        </div>
-        <div class="summary-row">
-          <span class="summary-label">Chance of rain:</span>
-          <span class="summary-value">${pop}%</span>
-        </div>
-        <div style="margin-top:10px; font-size:14px; color:#083b45;">
-          Use this information to decide what to bring on
-          <strong>Step 5 · Safety and packing</strong>.
-        </div>
+    const first = data.list[0];
+
+    currentTrip.weatherPlan.city = city;
+    currentTrip.weatherPlan.forecast = {
+      temp: Math.round(first.main.temp),
+      feels: Math.round(first.main.feels_like),
+      description: first.weather[0].description,
+      pop: Math.round((first.pop || 0) * 100)
+    };
+
+    resultsDiv.innerHTML = `
+      <div class="summary-card">
+        <h4>Forecast for ${city}</h4>
+        <div class="summary-row">
+          <span class="summary-label">Conditions:</span>
+          <span class="summary-value">${currentTrip.weatherPlan.forecast.description}</span>
+        </div>
+        <div class="summary-row">
+          <span class="summary-label">Temperature:</span>
+          <span class="summary-value">${currentTrip.weatherPlan.forecast.temp}°F (feels like ${currentTrip.weatherPlan.forecast.feels}°F)</span>
+        </div>
+        <div class="summary-row">
+          <span class="summary-label">Chance of rain:</span>
+          <span class="summary-value">${currentTrip.weatherPlan.forecast.pop}%</span>
+        </div>
+        <div style="margin-top:10px; font-size:14px; color:#083b45;">
+          Use this information to decide what to bring on
+          <strong>Step 5 · Safety and packing</strong>.
+        </div>
       </div>
     `;
   } catch (err) {
     console.error(err);
     resultsDiv.innerHTML = "Sorry, we could not load the weather. Try again.";
   }
 }
 
 // =========================================================
 //  RENDER FUNCTION
 // =========================================================
 
-function render() {
-  const app = document.getElementById("app");
-
-  if (!app) {
-    console.error("App container not found");
-    return;
-  }
+function render() {
+  const app = document.getElementById("app");
+
+  if (!app) {
+    console.error("App container not found");
+    return;
+  }
+
+  const userBadge = currentUser
+    ? `<div class="user-badge">Signed in as <strong>${currentUser.name}</strong> (${currentUser.role})</div>`
+    : `<div class="user-badge muted">Not signed in · <a href="#" onclick=\"goTo('login')\">Sign in</a></div>`;
 
   // -------------------------------------------------------
   // HOME SCREEN
   // -------------------------------------------------------
-  if (currentScreen === "home") {
-    app.innerHTML = `
-      <div class="screen">
-        <h2>Welcome to the CBI Planner</h2>
-        <p>This app helps you plan and reflect on your Community Based Instruction trips.</p>
-
-        <p><strong>Students:</strong> Go through each step in order. You will use Google Maps, read information, and enter your own answers.</p>
-
-        <button class="btn-primary" onclick="goTo('planDestination')">
-          Start Step 1 · Plan a New CBI Trip
-        </button>
+  if (currentScreen === "home") {
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Welcome to the CBI Planner</h2>
+        ${userBadge}
+        <p>This planner keeps the thinking work with students while giving teachers visibility. Every answer is typed by the
+  student—nothing is auto-filled—so you can coach from real data.</p>
+
+        <p><strong>Students:</strong> Work through each step in order. Use Google Maps only to view the route, read the weather
+  details yourself, and enter the information in your own words.</p>
+
+        <button class="btn-primary" onclick="goTo('planDestination')">
+          Start Step 1 · Plan a New CBI Trip
+        </button>
 
         <button class="btn-primary" onclick="goTo('past')">
           View My Past Trips
         </button>
 
-        <button class="btn-primary" onclick="goTo('practice')">
-          Practice Google Maps
-        </button>
-      </div>
-    `;
-  }
+        <button class="btn-primary" onclick="goTo('practice')">
+          Practice Google Maps
+        </button>
+
+        <button class="btn-primary" onclick="goTo('login')">
+          Sign in / Switch user
+        </button>
+      </div>
+    `;
+  }
 
   // -------------------------------------------------------
   // STEP 1: DESTINATION
   // -------------------------------------------------------
   else if (currentScreen === "planDestination") {
     app.innerHTML = `
       <div class="screen">
         <h2>Step 1 · Basic Trip Info</h2>
         <p>Enter the important basic information for your trip.</p>
 
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
@@ -352,110 +523,113 @@ function render() {
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
           Go to Step 2 · Google Maps
         </button>
 
         <button class="btn-secondary" onclick="goTo('home')">
           Back to Home
         </button>
       </div>
     `;
   }
 
   // -------------------------------------------------------
   // STEP 2: GOOGLE MAPS INSTRUCTIONS
   // -------------------------------------------------------
-  else if (currentScreen === "mapsInstructions") {
-    app.innerHTML = `
-      <div class="screen">
-        <h2>Step 2 · Use Google Maps</h2>
-        <p>Use Google Maps to find your bus route. This app will not fill in the answers for you. You will read the map and type your own information in Step 3.</p>
+  else if (currentScreen === "mapsInstructions") {
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Step 2 · Use Google Maps</h2>
+        <p>Let Google Maps handle the map only. Read the route yourself and type every detail back into the planner so the
+thinking stays with you.</p>
 
         <ol class="step-list">
-          <li>Check that the <strong>destination name</strong> and <strong>address</strong> in Step 1 are correct.</li>
-          <li>Tap the <strong>Open in Google Maps</strong> button below. A new tab or app will open.</li>
-          <li>Make sure the <strong>starting point</strong> is your school.</li>
-          <li>Change the travel type to <strong>Transit</strong> so you see bus and train routes.</li>
+          <li>Check that the <strong>destination name</strong> and <strong>address</strong> in Step 1 are correct—this prevents
+mistyping.</li>
+          <li>Tap the <strong>Open in Google Maps</strong> button below. A new tab or app will open for the map part.</li>
+          <li>Make sure the <strong>starting point</strong> is your school.</li>
+          <li>Change the travel type to <strong>Transit</strong> so you see bus and train routes.</li>
           <li>Look at the routes and choose the one that:
             <ul>
               <li>Arrives on time</li>
               <li>Has the fewest transfers</li>
               <li>Feels easiest for you</li>
             </ul>
           </li>
-          <li>Write down or remember:
-            <ul>
-              <li>Bus number and direction</li>
-              <li>First stop where you get on</li>
-              <li>Stop where you get off</li>
-              <li>Departure time and arrival time</li>
-              <li>Total travel time</li>
-            </ul>
-          </li>
-          <li>When you are done looking at Google Maps, come back to this CBI Planner tab and go to Step 3.</li>
-        </ol>
+          <li>Write down (do not copy and paste):
+            <ul>
+              <li>Bus number and direction</li>
+              <li>First stop where you get on</li>
+              <li>Stop where you get off</li>
+              <li>Departure time and arrival time</li>
+              <li>Total travel time</li>
+            </ul>
+          </li>
+          <li>When you finish reading Google Maps, come back to this tab and go to Step 3 to enter what you found.</li>
+        </ol>
 
         <button class="btn-primary" onclick="openMapsForCurrentTrip()">
           Open in Google Maps (Transit)
         </button>
 
         <button class="btn-primary" onclick="goTo('routeDetails')">
           Go to Step 3 · Route Details
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
 
   // -------------------------------------------------------
   // STEP 3: ROUTE DETAILS (THERE + BACK)
   // -------------------------------------------------------
   else if (currentScreen === "routeDetails") {
     const r = currentTrip.routeThere;
     const rb = currentTrip.routeBack;
 
-    app.innerHTML = `
-      <div class="screen">
-        <h2>Step 3 · Route Details</h2>
-        <p>Use the information from Google Maps. Type the details yourself.</p>
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Step 3 · Route Details</h2>
+        <p>Transfer the information you read in Google Maps. Type every detail so you practice reading routes and recording
+directions accurately.</p>
 
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
@@ -564,54 +738,55 @@ function render() {
           value="${rb.totalTime}"
           oninput="updateRouteBackField('totalTime', this.value)"
         />
 
         <button class="btn-primary" onclick="goTo('purpose')">
           Go to Step 4 · Trip Purpose
         </button>
 
         <button class="btn-secondary" onclick="goTo('mapsInstructions')">
           Back to Step 2
         </button>
 
         <button class="btn-secondary" onclick="goTo('home')">
           Back to Home
         </button>
       </div>
     `;
   }
 
   // -------------------------------------------------------
   // STEP 4: TRIP PURPOSE
   // -------------------------------------------------------
   else if (currentScreen === "purpose") {
     const p = currentTrip.purpose;
 
-    app.innerHTML = `
-      <div class="screen">
-        <h2>Step 4 · Why are we going?</h2>
-        <p>Check all the skills you will practice on this trip.</p>
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Step 4 · Why are we going?</h2>
+        <p>Mirror your paper CBI form: choose the purpose and skills you will practice. Your choices help the teacher see the
+instructional goal.</p>
 
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
@@ -846,62 +1021,65 @@ function render() {
         <textarea
           id="nextTime"
           class="textarea-small"
           placeholder="Example: Look at the map earlier, ask staff more questions, double check the bus direction."
           oninput="updateReflectionField('nextTime', this.value)"
         >${r.nextTime}</textarea>
 
         <button class="btn-primary" onclick="goTo('summary')">
           View Trip Summary
         </button>
 
         <button class="btn-secondary" onclick="goTo('safetyPacking')">
           Back to Step 5
         </button>
 
         <button class="btn-secondary" onclick="goTo('home')">
           Back to Home
         </button>
       </div>
     `;
   }
 
   // -------------------------------------------------------
   // TRIP SUMMARY SCREEN
   // -------------------------------------------------------
-  else if (currentScreen === "summary") {
-    const r = currentTrip.routeThere;
-    const rb = currentTrip.routeBack;
-    const pHtml = renderPurposeSummary();
-    const packHtml = renderPackingSummary();
-    const s = currentTrip.safety;
-    const refl = currentTrip.reflection;
-
-    app.innerHTML = `
-      <div class="screen">
-        <h2>Trip Summary</h2>
-        <p>Review your plan and reflection. If something looks wrong, go back and edit that step.</p>
+  else if (currentScreen === "summary") {
+    const r = currentTrip.routeThere;
+    const rb = currentTrip.routeBack;
+    const pHtml = renderPurposeSummary();
+    const packHtml = renderPackingSummary();
+    const weatherPackHtml = renderWeatherPackingSummary();
+    const s = currentTrip.safety;
+    const refl = currentTrip.reflection;
+    const wp = currentTrip.weatherPlan;
+
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Trip Summary</h2>
+        <p>Review your plan and reflection. Teachers can see the exact route, purpose, weather thinking, and packing choices you
+typed—no automation, just visibility. If something looks wrong, go back and edit that step.</p>
 
         <div class="summary-grid">
           <div class="summary-card">
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
           </div>
 
           <div class="summary-card">
             <h4>Route there</h4>
             <div class="summary-row">
@@ -944,181 +1122,391 @@ function render() {
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
           </div>
 
-          <div class="summary-card">
-            <h4>Trip purpose</h4>
-            <ul class="summary-list">
-              ${pHtml}
-            </ul>
-          </div>
+          <div class="summary-card">
+            <h4>Trip purpose</h4>
+            <ul class="summary-list">
+              ${pHtml}
+            </ul>
+          </div>
+
+          <div class="summary-card">
+            <h4>Weather reading and plan</h4>
+            <div class="summary-row">
+              <span class="summary-label">City checked:</span>
+              <span class="summary-value">${wp.city || "-"}</span>
+            </div>
+            <div class="summary-row">
+              <span class="summary-label">Conditions:</span>
+              <span class="summary-value">${wp.forecast ? wp.forecast.description : "Check the weather"}</span>
+            </div>
+            <div class="summary-row">
+              <span class="summary-label">Temp / rain:</span>
+              <span class="summary-value">${
+                wp.forecast
+                  ? `${wp.forecast.temp}°F (feels like ${wp.forecast.feels}°F) · ${wp.forecast.pop}% chance of rain`
+                  : "-"
+              }</span>
+            </div>
+            <div style="margin-top:8px;">
+              <span class="summary-label">Packing based on weather:</span>
+              <ul class="summary-list">
+                ${weatherPackHtml}
+              </ul>
+            </div>
+          </div>
 
           <div class="summary-card">
             <h4>Safety, money, and packing</h4>
             <div class="summary-row">
               <span class="summary-label">Money needed:</span>
               <span class="summary-value">${s.moneyNeeded || "-"}</span>
             </div>
             <div style="margin-top:6px; font-size:14px;">
               <span class="summary-label">Safety rules:</span>
               <div class="summary-value" style="margin-top:4px; white-space:pre-wrap;">
                 ${s.safetyRules || "-"}
               </div>
             </div>
             <div style="margin-top:8px;">
               <span class="summary-label">Packing list:</span>
               <ul class="summary-list">
                 ${packHtml}
               </ul>
             </div>
           </div>
 
-          <div class="summary-card">
-            <h4>Reflection</h4>
+          <div class="summary-card">
+            <h4>Reflection</h4>
             <div class="summary-row">
               <span class="summary-label">Went as planned:</span>
             </div>
             <div class="summary-value" style="margin-bottom:8px; white-space:pre-wrap;">
               ${refl.wentAsPlanned || "-"}
             </div>
 
             <div class="summary-row">
               <span class="summary-label">What was easy:</span>
             </div>
             <div class="summary-value" style="margin-bottom:8px; white-space:pre-wrap;">
               ${refl.easyPart || "-"}
             </div>
 
             <div class="summary-row">
               <span class="summary-label">What was hard:</span>
             </div>
             <div class="summary-value" style="margin-bottom:8px; white-space:pre-wrap;">
               ${refl.hardPart || "-"}
             </div>
 
             <div class="summary-row">
               <span class="summary-label">Next time:</span>
             </div>
             <div class="summary-value" style="white-space:pre-wrap;">
-              ${refl.nextTime || "-"}
-            </div>
-          </div>
-        </div>
+              ${refl.nextTime || "-"}
+            </div>
+          </div>
+
+          <div class="summary-card">
+            <h4>Save for review</h4>
+            <p class="summary-value" style="margin-bottom:10px;">
+              ${currentUser ? `Signed in as ${currentUser.name} (${currentUser.role})` : "Sign in as a student to save this trip."}
+            </p>
+            <button class="btn-primary" onclick="saveCurrentTrip()">Save trip to my dashboard</button>
+            <button class="btn-secondary" onclick="goTo('studentDashboard')">Go to student dashboard</button>
+          </div>
+        </div>
 
         <button class="btn-secondary" onclick="goTo('reflection')">
           Back to Step 6
         </button>
 
         <button class="btn-secondary" onclick="goTo('home')">
           Back to Home
         </button>
       </div>
     `;
   }
 
-  // -------------------------------------------------------
-  // WEATHER LOOKUP SCREEN
-  // -------------------------------------------------------
-  else if (currentScreen === "weather") {
-    app.innerHTML = `
-      <div class="screen">
-        <h2>Check Weather for Your Trip</h2>
-        <p>Use this to look up the weather for your CBI destination. Read the information and then decide what to bring on Step 5.</p>
-
-        <label for="weatherCity">City or destination</label>
-        <input
-          id="weatherCity"
-          type="text"
-          placeholder="Example: Anaheim, CA"
-          value="${currentTrip.destinationAddress || currentTrip.destinationName || ""}"
-        />
-
-        <button class="btn-primary" onclick="lookupWeather()">
-          Look up weather
-        </button>
-
-        <div id="weatherResults" style="margin-top:16px;"></div>
-
-        <button class="btn-secondary" onclick="goTo('home')">
-          Back to Home
-        </button>
-      </div>
-    `;
-  }
-
-  // -------------------------------------------------------
-  // PAST TRIPS PLACEHOLDER
-  // -------------------------------------------------------
-  else if (currentScreen === "past") {
-    app.innerHTML = `
-      <div class="screen">
-        <h2>Past Trips</h2>
-        <p>Saved trips will show here in a future version of the app.</p>
-
-        <button class="btn-secondary" onclick="goTo('home')">
-          Back to Home
-        </button>
-      </div>
+  // -------------------------------------------------------
+  // WEATHER LOOKUP SCREEN
+  // -------------------------------------------------------
+  else if (currentScreen === "weather") {
+    const wp = currentTrip.weatherPlan;
+    const forecastHtml = wp.forecast
+      ? `
+        <div class="summary-card">
+          <h4>Forecast for ${wp.city}</h4>
+          <div class="summary-row">
+            <span class="summary-label">Conditions:</span>
+            <span class="summary-value">${wp.forecast.description}</span>
+          </div>
+          <div class="summary-row">
+            <span class="summary-label">Temperature:</span>
+            <span class="summary-value">${wp.forecast.temp}°F (feels like ${wp.forecast.feels}°F)</span>
+          </div>
+          <div class="summary-row">
+            <span class="summary-label">Chance of rain:</span>
+            <span class="summary-value">${wp.forecast.pop}%</span>
+          </div>
+        </div>
+      `
+      : "";
+
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Check Weather for Your Trip</h2>
+        <p>The weather tool is a reading and interpretation task. Type the city yourself, read the raw information, and then
+decide what to bring on Step 5.</p>
+
+        <label for="weatherCity">City or destination</label>
+        <input
+          id="weatherCity"
+          type="text"
+          placeholder="Example: Anaheim, CA"
+          value="${wp.city}"
+          oninput="updateWeatherPlanField('city', this.value)"
+        />
+
+        <button class="btn-primary" onclick="lookupWeather()">
+          Look up weather
+        </button>
+
+        <div id="weatherResults" style="margin-top:16px;">${forecastHtml}</div>
+
+        <h3 class="section-title" style="margin-top:24px;">What will you bring based on this weather?</h3>
+        <p class="section-subtitle">Choose items and explain your decision. The app will not choose for you.</p>
+
+        <div class="checklist-group">
+          ${Object.entries(wp.packingChoices)
+            .map(
+              ([key, value]) => `
+                <label class="checklist-item">
+                  <input type="checkbox" ${value ? "checked" : ""} onchange="toggleWeatherPacking('${key}', this.checked)" />
+                  ${
+                    {
+                      jacket: "Jacket or sweater",
+                      umbrella: "Umbrella or raincoat",
+                      sunscreen: "Sunscreen",
+                      waterBottle: "Water bottle",
+                      hat: "Hat or sun protection"
+                    }[key]
+                  }
+                </label>
+              `
+            )
+            .join("")}
+        </div>
+
+        <label for="weatherNotes">Explain your packing choice</label>
+        <textarea
+          id="weatherNotes"
+          class="textarea-small"
+          placeholder="Example: It's 55°F with 60% chance of rain, so I will bring a jacket and umbrella."
+          oninput="updateWeatherPlanField('packingNotes', this.value)"
+        >${wp.packingNotes}</textarea>
+
+        <button class="btn-secondary" onclick="goTo('home')">
+          Back to Home
+        </button>
+      </div>
     `;
   }
 
-  // -------------------------------------------------------
-  // PRACTICE MAPS PLACEHOLDER
-  // -------------------------------------------------------
-  else if (currentScreen === "practice") {
-    app.innerHTML = `
-      <div class="screen">
-        <h2>Practice Google Maps</h2>
-        <p>Practice scenarios will appear here in a future version. You will be able to practice planning routes without going on a real trip.</p>
-
-        <button class="btn-secondary" onclick="goTo('home')">
-          Back to Home
-        </button>
-      </div>
-    `;
-  }
+  // -------------------------------------------------------
+  // PAST TRIPS (STUDENT PERSONAL HISTORY)
+  // -------------------------------------------------------
+  else if (currentScreen === "past") {
+    const myTrips = currentUser && currentUser.role === "student"
+      ? savedTrips.filter(t => t.studentName === currentUser.name)
+      : [];
+
+    const tripCards = myTrips.length
+      ? myTrips
+          .map(
+            t => `
+              <div class="summary-card">
+                <h4>${t.data.destinationName || "Untitled Trip"}</h4>
+                <div class="summary-row"><span class="summary-label">Planned by:</span><span class="summary-value">${t.studentName}</span></div>
+                <div class="summary-row"><span class="summary-label">Saved:</span><span class="summary-value">${formatDate(t.createdAt)}</span></div>
+                <div class="summary-row"><span class="summary-label">Route there:</span><span class="summary-value">${t.data.routeThere.busNumber || "?"} to ${t.data.routeThere.exitStop || "?"}</span></div>
+                <div class="summary-row"><span class="summary-label">Purpose:</span><span class="summary-value">${renderPurposeSummaryFromData(t.data)}</span></div>
+              </div>
+            `
+          )
+          .join("")
+      : "<p class=\"summary-value\">Sign in as a student and save trips to see them here.</p>";
+
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Past Trips</h2>
+        ${userBadge}
+        <div class="summary-grid">${tripCards}</div>
+
+        <button class="btn-secondary" onclick="goTo('home')">
+          Back to Home
+        </button>
+      </div>
+    `;
+  }
+
+  // -------------------------------------------------------
+  // PRACTICE MAPS PLACEHOLDER
+  // -------------------------------------------------------
+  else if (currentScreen === "practice") {
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Practice Google Maps</h2>
+        <p>Practice scenarios will appear here in a future version. You will be able to practice planning routes without going on a real trip.</p>
+
+        <button class="btn-secondary" onclick="goTo('home')">
+          Back to Home
+        </button>
+      </div>
+    `;
+  }
+
+  // -------------------------------------------------------
+  // LOGIN SCREEN
+  // -------------------------------------------------------
+  else if (currentScreen === "login") {
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Sign in</h2>
+        ${userBadge}
+        <p>Choose your role so the app can show the right view.</p>
+
+        <label for="loginName">Name</label>
+        <input id="loginName" type="text" placeholder="Enter your name" value="${currentUser ? currentUser.name : ""}" />
+
+        <label for="loginRole">I am a...</label>
+        <select id="loginRole">
+          <option value="student" ${currentUser && currentUser.role === "student" ? "selected" : ""}>Student</option>
+          <option value="teacher" ${currentUser && currentUser.role === "teacher" ? "selected" : ""}>Teacher</option>
+        </select>
+
+        <button class="btn-primary" onclick="handleLogin()">Sign in</button>
+        <button class="btn-secondary" onclick="handleLogout()">Sign out</button>
+      </div>
+    `;
+  }
+
+  // -------------------------------------------------------
+  // STUDENT DASHBOARD
+  // -------------------------------------------------------
+  else if (currentScreen === "studentDashboard") {
+    const myTrips = currentUser && currentUser.role === "student"
+      ? savedTrips.filter(t => t.studentName === currentUser.name)
+      : [];
+
+    const cards = myTrips.length
+      ? myTrips
+          .map(
+            t => `
+              <div class="summary-card">
+                <div class="summary-row"><span class="summary-label">Trip:</span><span class="summary-value">${t.data.destinationName || "Untitled"}</span></div>
+                <div class="summary-row"><span class="summary-label">Saved:</span><span class="summary-value">${formatDate(t.createdAt)}</span></div>
+                <div class="summary-row"><span class="summary-label">Route there:</span><span class="summary-value">${t.data.routeThere.busNumber || "?"} · ${t.data.routeThere.direction || ""}</span></div>
+                <div class="summary-row"><span class="summary-label">Stops:</span><span class="summary-value">${t.data.routeThere.boardStop || "?"} → ${t.data.routeThere.exitStop || "?"}</span></div>
+                <div class="summary-row"><span class="summary-label">Purpose:</span><span class="summary-value">${renderPurposeSummaryFromData(t.data)}</span></div>
+              </div>
+            `
+          )
+          .join("")
+      : "<p class=\"summary-value\">Save a trip to see it here.</p>";
+
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Student Dashboard</h2>
+        ${userBadge}
+        <p>Save your trip on the summary screen to see it here and discuss with your teacher.</p>
+
+        <div class="summary-grid">${cards}</div>
+
+        <button class="btn-primary" onclick="goTo('summary')">Back to Trip Summary</button>
+        <button class="btn-secondary" onclick="goTo('home')">Back to Home</button>
+      </div>
+    `;
+  }
+
+  // -------------------------------------------------------
+  // TEACHER VIEW
+  // -------------------------------------------------------
+  else if (currentScreen === "teacher") {
+    const cards = savedTrips.length
+      ? savedTrips
+          .map(
+            t => `
+              <div class="summary-card">
+                <h4>${t.data.destinationName || "Untitled Trip"}</h4>
+                <div class="summary-row"><span class="summary-label">Student:</span><span class="summary-value">${t.studentName}</span></div>
+                <div class="summary-row"><span class="summary-label">Saved:</span><span class="summary-value">${formatDate(t.createdAt)}</span></div>
+                <div class="summary-row"><span class="summary-label">Route there:</span><span class="summary-value">${t.data.routeThere.busNumber || "?"} → ${t.data.routeThere.exitStop || "?"}</span></div>
+                <div class="summary-row"><span class="summary-label">Route back:</span><span class="summary-value">${t.data.routeBack.busNumber || "?"} → ${t.data.routeBack.exitStop || "?"}</span></div>
+                <div class="summary-row"><span class="summary-label">Purpose:</span><span class="summary-value">${renderPurposeSummaryFromData(t.data)}</span></div>
+                <div class="summary-row"><span class="summary-label">Safety focus:</span><span class="summary-value">${t.data.safety.moneyNeeded || "-"}</span></div>
+                <div class="summary-row"><span class="summary-label">Reflection note:</span><span class="summary-value">${t.data.reflection.wentAsPlanned || "(not completed)"}</span></div>
+              </div>
+            `
+          )
+          .join("")
+      : "<p class=\"summary-value\">No saved trips yet.</p>";
+
+    app.innerHTML = `
+      <div class="screen">
+        <h2>Teacher View</h2>
+        ${userBadge}
+        <p>See student-entered routes, safety plans, and reflections for documentation and coaching.</p>
+
+        <div class="summary-grid">${cards}</div>
+
+        <button class="btn-secondary" onclick="goTo('home')">Back to Home</button>
+      </div>
+    `;
+  }
 }
 
 // =========================================================
 //  SIDEBAR BEHAVIOR
 // =========================================================
 
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
   render();
   highlightSidebar(currentScreen);
 
   const sidebarItems = document.querySelectorAll(".sidebar-item");
   sidebarItems.forEach(item => {
     const screen = item.getAttribute("data-screen");
 
EOF
)
