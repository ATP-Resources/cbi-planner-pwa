// APP STATE
let currentScreen = "home";

// MAIN RENDER FUNCTION
function render() {
  const app = document.getElementById("app");

  if (currentScreen === "home") {
    app.innerHTML = `
      <div class="screen">
        <h2>Welcome</h2>
        <p>Choose an option below.</p>

        <button class="btn-primary" onclick="goTo('plan')">
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

  if (currentScreen === "plan") {
    app.innerHTML = `
      <div class="screen">
        <h2>Plan a Trip</h2>
        <p>This will become your full trip planner flow.</p>

        <button class="btn-secondary" onclick="goTo('home')">
          Back to Home
        </button>
      </div>
    `;
  }

  if (currentScreen === "past") {
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

  if (currentScreen === "practice") {
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

function goTo(screen) {
  currentScreen = screen;
  render();
}

// INITIAL LOAD
render();


