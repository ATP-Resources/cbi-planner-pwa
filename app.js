// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAC-zl14hzA9itpol-0yhz4NYiSF-aSy4Q",
  authDomain: "cbi-planner-web.firebaseapp.com",
  projectId: "cbi-planner-web"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// App state
let currentScreen = "landing";
let currentTeacher = null;
let selectedClass = null;
let selectedStudent = null;

// Helpers
function $(id) {
  return document.getElementById(id);
}

function setApp(html) {
  $("app").innerHTML = html;
}

function goTo(screen) {
  currentScreen = screen;
  render();
  highlightSidebar();
}

function highlightSidebar() {
  document.querySelectorAll(".sidebar-item").forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.getAttribute("data-screen") === currentScreen
    );
  });
}

// Screens
function render() {
  if (currentScreen === "landing") {
    setApp(`
      <div class="screen">
        <h2>Welcome</h2>
        <p>Select a mode to continue.</p>

        <button class="btn-primary" onclick="goTo('teacherAuth')">
          Teacher
        </button>

        <button class="btn-secondary" onclick="alert('Student mode coming next')">
          Student
        </button>
      </div>
    `);
  }

  if (currentScreen === "teacherAuth") {
    setApp(`
      <div class="screen">
        <h2>Teacher login</h2>
        <p>Use your school Google account.</p>

        <button class="btn-primary" id="googleLogin">
          Sign in with Google
        </button>
      </div>
    `);

    $("googleLogin").onclick = async () => {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    };
  }

  if (currentScreen === "teacherClasses") {
    loadTeacherClasses();
  }

  if (currentScreen === "classRoster") {
    loadClassRoster();
  }

  if (currentScreen === "studentTrips") {
    loadStudentTrips();
  }
}

// Teacher data
async function loadTeacherClasses() {
  const ref = collection(db, "teachers", currentTeacher.uid, "classes");
  const snap = await getDocs(ref);

  let html = `
    <div class="screen">
      <h2>Your classes</h2>
      <button class="btn-primary" id="createClass">Create class</button>
  `;

  snap.forEach(docSnap => {
    html += `
      <div class="summary-card">
        <strong>${docSnap.data().name}</strong>
        <button class="btn-secondary" onclick="openClass('${docSnap.id}')">
          Open
        </button>
      </div>
    `;
  });

  html += `</div>`;
  setApp(html);

  $("createClass").onclick = async () => {
    const name = prompt("Class name");
    if (!name) return;
    await addDoc(ref, { name });
    loadTeacherClasses();
  };
}

function openClass(classId) {
  selectedClass = classId;
  goTo("classRoster");
}

async function loadClassRoster() {
  const ref = collection(
    db,
    "teachers",
    currentTeacher.uid,
    "classes",
    selectedClass,
    "students"
  );

  const snap = await getDocs(ref);

  let html = `
    <div class="screen">
      <h2>Class roster</h2>
  `;

  snap.forEach(s => {
    html += `
      <div class="summary-card">
        <strong>${s.data().name}</strong>
        <button class="btn-secondary"
          onclick="viewStudentTrips('${s.id}')">
          View trips
        </button>
      </div>
    `;
  });

  html += `
      <button class="btn-secondary" onclick="goTo('teacherClasses')">
        Back
      </button>
    </div>
  `;

  setApp(html);
}

function viewStudentTrips(studentId) {
  selectedStudent = studentId;
  goTo("studentTrips");
}

async function loadStudentTrips() {
  const ref = collection(
    db,
    "teachers",
    currentTeacher.uid,
    "classes",
    selectedClass,
    "students",
    selectedStudent,
    "trips"
  );

  const q = query(ref, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  let html = `
    <div class="screen">
      <h2>Student trips</h2>
  `;

  snap.forEach(t => {
    html += `
      <div class="summary-card">
        <div class="summary-row">
          <span>Destination</span>
          <span>${t.data().destinationName || "-"}</span>
        </div>
        <div class="summary-row">
          <span>Date</span>
          <span>${t.data().tripDate || "-"}</span>
        </div>
      </div>
    `;
  });

  html += `
      <button class="btn-secondary" onclick="goTo('classRoster')">
        Back to roster
      </button>
    </div>
  `;

  setApp(html);
}

// Auth listener
onAuthStateChanged(auth, user => {
  currentTeacher = user || null;
  if (user) {
    goTo("teacherClasses");
  } else {
    goTo("landing");
  }
});

// Sidebar wiring
document.querySelectorAll(".sidebar-item").forEach(btn => {
  btn.onclick = () => goTo(btn.getAttribute("data-screen"));
});

// Initial render
render();
