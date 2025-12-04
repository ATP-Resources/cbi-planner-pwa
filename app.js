// Which screen is showing
let currentScreen = "home";

// Draft of the trip the student is planning
let currentTrip = {
  destinationName: "",
  destinationAddress: "",
  tripDate: "",
  meetTime: ""
};

// Used by inputs in the form
function updateTripField(field, value) {
  currentTrip[field] = value;
}

// Build a Google Maps transit link from school to the destination
function openMapsForCurrentTrip() {
  // You can change this to your exact school address
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

// Change screens
function goTo(screen) {
  currentScreen = screen;
  render();
}

// Main render function
function render() {
  const app = document.getElementById("app");

  if (!app) {
    console.error("App container not found");
    return;
  }

  // HOME SC
