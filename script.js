/* =========================================================
   POLARIS — Online Voting System
   All state is kept in localStorage so it survives a refresh
   without any real backend. Session (who's currently logged
   in) is kept in sessionStorage so it clears when the tab closes.
   ========================================================= */

// ---------------------------------------------------------
// Storage keys & seed data
// ---------------------------------------------------------
const STORAGE_KEYS = {
  voters: "polaris_voters",
  candidates: "polaris_candidates",
};

const SESSION_KEYS = {
  voterId: "polaris_session_voter",
  isAdmin: "polaris_session_admin",
};

const ADMIN_PASSCODE = "admin123"; // demo-only passcode for the mock admin panel

// A small default slate of candidates so the demo isn't empty on first load.
const DEFAULT_CANDIDATES = [
  { id: "c1", name: "Rhea Kapoor", party: "Progress Alliance", manifesto: "Better labs, 24x7 library access, and a real say in curriculum design.", votes: 0 },
  { id: "c2", name: "Aditya Menon", party: "Unity Front", manifesto: "Free shuttle service, mental health support desks, and transparent fest budgets.", votes: 0 },
  { id: "c3", name: "Simran Kaur", party: "Campus First", manifesto: "More internship tie-ups, hostel wifi upgrade, and monthly open-forum town halls.", votes: 0 },
];

// ---------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------
function loadVoters() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.voters) || "[]");
}
function saveVoters(voters) {
  localStorage.setItem(STORAGE_KEYS.voters, JSON.stringify(voters));
}
function loadCandidates() {
  const stored = localStorage.getItem(STORAGE_KEYS.candidates);
  if (!stored) {
    saveCandidates(DEFAULT_CANDIDATES);
    return DEFAULT_CANDIDATES.slice();
  }
  return JSON.parse(stored);
}
function saveCandidates(candidates) {
  localStorage.setItem(STORAGE_KEYS.candidates, JSON.stringify(candidates));
}

// Very small non-cryptographic hash — this is a front-end demo,
// not a real auth system, so we just avoid storing plain-text passwords.
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

// ---------------------------------------------------------
// View switching
// ---------------------------------------------------------
const VIEW_IDS = ["landing", "register", "login", "admin-login", "vote", "thankyou", "admin"];

function showView(name) {
  VIEW_IDS.forEach((id) => {
    const el = document.getElementById(`view-${id}`);
    if (el) el.classList.toggle("hidden", id !== name);
    const activeElement = document.getElementById('view-${name}');
    if (activeElement) {
      activeElement.classList.add('fade-in');
    }
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  syncNav();
}

function syncNav() {
  const voterId = sessionStorage.getItem(SESSION_KEYS.voterId);
  const isAdmin = sessionStorage.getItem(SESSION_KEYS.isAdmin) === "true";
  document.getElementById("logoutBtn").classList.toggle("hidden", !(voterId || isAdmin));
}

// Any element with data-nav="X" becomes a button that shows view X.
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-nav]");
  if (target) showView(target.getAttribute("data-nav"));
});

// ---------------------------------------------------------
// Toast helper
// ---------------------------------------------------------
let toastTimer = null;
function showToast(message, type = "default") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "toast"; // reset classes
  if (type === "error") toast.classList.add("toast--error");
  if (type === "success") toast.classList.add("toast--success");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

// ---------------------------------------------------------
// Landing stats
// ---------------------------------------------------------
function refreshLandingStats() {
  const voters = loadVoters();
  const candidates = loadCandidates();
  document.getElementById("statVoters").textContent = voters.length;
  document.getElementById("statCast").textContent = voters.filter((v) => v.hasVoted).length;
  document.getElementById("statCandidates").textContent = candidates.length;
}

// ---------------------------------------------------------
// Field-level validation helpers
// ---------------------------------------------------------
function setFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  const errorEl = document.querySelector(`[data-error-for="${inputId}"]`);
  input.closest(".field").classList.toggle("has-error", Boolean(message));
  if (errorEl) errorEl.textContent = message || "";
}

function clearAllErrors(formEl) {
  formEl.querySelectorAll(".field").forEach((f) => f.classList.remove("has-error"));
  formEl.querySelectorAll(".field__error").forEach((e) => (e.textContent = ""));
}

// ---------------------------------------------------------
// REGISTRATION
// ---------------------------------------------------------
const registerForm = document.getElementById("registerForm");
registerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  clearAllErrors(registerForm);
  hideBanner("registerBanner");

  const name = document.getElementById("regName").value.trim();
  const roll = document.getElementById("regRoll").value.trim();
  const branch = document.getElementById("regBranch").value;
  const aadhar = document.getElementById("regAadhar").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;

  let valid = true;

  if (name.length < 3) { setFieldError("regName", "Enter your full name (min 3 characters)."); valid = false; }
  if (roll.length < 3) { setFieldError("regRoll", "Enter a valid roll number."); valid = false; }
  if (!branch) { setFieldError("regBranch", "Please select your branch."); valid = false; }
  if (!/^\d{12}$/.test(aadhar)) { setFieldError("regAadhar", "Aadhar number must be exactly 12 digits."); valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError("regEmail", "Enter a valid email address."); valid = false; }
  if (password.length < 6) { setFieldError("regPassword", "Password must be at least 6 characters."); valid = false; }

  if (!valid) return;

  const voters = loadVoters();

  // Enforce "one person, one vote" at the identity level: neither the
  // Aadhar number nor the roll number may ever be registered twice.
  const rollTaken = voters.some((v) => v.roll.toLowerCase() === roll.toLowerCase());
  const aadharTaken = voters.some((v) => v.aadhar === aadhar);

  if (rollTaken) { setFieldError("regRoll", "This roll number is already registered."); valid = false; }
  if (aadharTaken) { setFieldError("regAadhar", "This Aadhar number is already registered."); valid = false; }
  if (!valid) return;

  const newVoter = {
    id: "V" + Date.now().toString(36).toUpperCase(),
    name,
    roll,
    branch,
    aadhar,
    email,
    passwordHash: simpleHash(password),
    hasVoted: false,
    votedFor: null,
    votedAt: null,
  };

  voters.push(newVoter);
  saveVoters(voters);

  showBanner("registerBanner", `Welcome, ${name.split(" ")[0]}! Your voter ID is ${newVoter.id}. You can log in now.`, "success");
  registerForm.reset();
  refreshLandingStats();

  setTimeout(() => showView("login"), 1400);
});

function showBanner(id, message, type) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.classList.remove("hidden", "form-banner--error", "form-banner--success");
  el.classList.add(type === "success" ? "form-banner--success" : "form-banner--error");
}
function hideBanner(id) {
  document.getElementById(id).classList.add("hidden");
}

// ---------------------------------------------------------
// LOGIN
// ---------------------------------------------------------
const loginForm = document.getElementById("loginForm");
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideBanner("loginBanner");

  const idValue = document.getElementById("loginId").value.trim();
  const password = document.getElementById("loginPassword").value;
  const voters = loadVoters();

  const voter = voters.find(
    (v) => v.roll.toLowerCase() === idValue.toLowerCase() || v.aadhar === idValue
  );

  if (!voter || voter.passwordHash !== simpleHash(password)) {
    showBanner("loginBanner", "Incorrect roll/Aadhar number or password.", "error");
    return;
  }

  sessionStorage.setItem(SESSION_KEYS.voterId, voter.id);
  loginForm.reset();

  if (voter.hasVoted) {
    // Already voted — send straight to the receipt, never back into the ballot.
    renderReceipt(voter);
    showView("thankyou");
  } else {
    renderVotingDashboard(voter);
    showView("vote");
  }
});

// ---------------------------------------------------------
// ADMIN LOGIN
// ---------------------------------------------------------
document.getElementById("adminEntry").addEventListener("click", () => showView("admin-login"));

const adminLoginForm = document.getElementById("adminLoginForm");
adminLoginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideBanner("adminLoginBanner");
  const pass = document.getElementById("adminPass").value;

  if (pass !== ADMIN_PASSCODE) {
    showBanner("adminLoginBanner", "Incorrect passcode. Try again.", "error");
    return;
  }
  sessionStorage.setItem(SESSION_KEYS.isAdmin, "true");
  adminLoginForm.reset();
  renderAdminDashboard();
  showView("admin");
});

// ---------------------------------------------------------
// LOGOUT (voter or admin)
// ---------------------------------------------------------
function logout() {
  sessionStorage.removeItem(SESSION_KEYS.voterId);
  sessionStorage.removeItem(SESSION_KEYS.isAdmin);
  showToast("Logged out.");
  showView("landing");
  refreshLandingStats();
}
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("adminLogoutBtn").addEventListener("click", logout);

// ---------------------------------------------------------
// VOTING DASHBOARD
// ---------------------------------------------------------
let pendingVote = null; // { voterId, candidateId } — held while the confirm modal is open

function renderVotingDashboard(voter) {
  document.getElementById("voterWelcome").textContent = `${voter.name} · ${voter.roll}`;
  const chip = document.getElementById("voterStatusChip");
  chip.textContent = voter.hasVoted ? "Vote recorded" : "Not yet voted";
  chip.classList.toggle("status-chip--voted", voter.hasVoted);

  const candidates = loadCandidates();
  const grid = document.getElementById("candidateGrid");
  grid.innerHTML = "";

  if (candidates.length === 0) {
    grid.innerHTML = `<p class="empty-note">No candidates have been added yet. Please check back once the election commission publishes the ballot.</p>`;
    return;
  }

  candidates.forEach((candidate) => {
    const initials = candidate.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
    const card = document.createElement("div");
    card.className = "candidate-card";
    card.innerHTML = `
      <div class="candidate-card__avatar">${initials}</div>
      <h3 class="candidate-card__name">${escapeHtml(candidate.name)}</h3>
      <p class="candidate-card__party">${escapeHtml(candidate.party)}</p>
      <p class="candidate-card__manifesto">${escapeHtml(candidate.manifesto)}</p>
      ${
        voter.hasVoted
          ? `<div class="candidate-card__voted-tag">${voter.votedFor === candidate.id ? "✓ You voted for this candidate" : "Voting closed"}</div>`
          : `<button class="btn btn--primary candidate-card__vote-btn" data-candidate-id="${candidate.id}">Vote now</button>`
      }
    `;
    grid.appendChild(card);
  });

  // Wire up vote buttons (only present when the voter hasn't voted yet).
  grid.querySelectorAll("[data-candidate-id]").forEach((btn) => {
    btn.addEventListener("click", () => openConfirmModal(voter.id, btn.getAttribute("data-candidate-id")));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------
// VOTE CONFIRMATION MODAL
// ---------------------------------------------------------
function openConfirmModal(voterId, candidateId) {
  const candidates = loadCandidates();
  const candidate = candidates.find((c) => c.id === candidateId);
  if (!candidate) return;

  pendingVote = { voterId, candidateId };
  document.getElementById("modalCandidateName").textContent = `${candidate.name} (${candidate.party})`;
  document.getElementById("confirmModal").classList.remove("hidden");
}

function closeConfirmModal() {
  pendingVote = null;
  document.getElementById("confirmModal").classList.add("hidden");
}

document.getElementById("modalCancel").addEventListener("click", closeConfirmModal);
document.getElementById("confirmModal").addEventListener("click", (e) => {
  if (e.target.id === "confirmModal") closeConfirmModal(); // click outside the card
});

document.getElementById("modalConfirm").addEventListener("click", () => {
  if (!pendingVote) return;
  const { voterId, candidateId } = pendingVote;

  const voters = loadVoters();
  const voter = voters.find((v) => v.id === voterId);

  // Defensive re-check: never allow a second vote, even if this were
  // somehow triggered twice (e.g. duplicate tabs, stale state).
  if (!voter || voter.hasVoted) {
    showToast("This voter has already cast a ballot.", "error");
    closeConfirmModal();
    return;
  }

  const candidates = loadCandidates();
  const candidate = candidates.find((c) => c.id === candidateId);
  if (!candidate) {
    showToast("That candidate is no longer available.", "error");
    closeConfirmModal();
    return;
  }

  // Lock the vote in — this is the one-way, permanent action.
  voter.hasVoted = true;
  voter.votedFor = candidateId;
  voter.votedAt = new Date().toISOString();
  candidate.votes += 1;

  saveVoters(voters);
  saveCandidates(candidates);
  closeConfirmModal();

  renderReceipt(voter);
  showView("thankyou");
  refreshLandingStats();
});

// ---------------------------------------------------------
// THANK-YOU RECEIPT
// ---------------------------------------------------------
function renderReceipt(voter) {
  const candidates = loadCandidates();
  const candidate = candidates.find((c) => c.id === voter.votedFor);

  document.getElementById("receiptName").textContent = voter.name.split(" ")[0];
  document.getElementById("receiptCandidate").textContent = candidate ? `${candidate.name} (${candidate.party})` : "a candidate";
  document.getElementById("receiptId").textContent = voter.id;
  document.getElementById("receiptTime").textContent = voter.votedAt
    ? new Date(voter.votedAt).toLocaleString()
    : "—";
}

// ---------------------------------------------------------
// ADMIN DASHBOARD
// ---------------------------------------------------------
let barChartInstance = null;
let pieChartInstance = null;

function renderAdminDashboard() {
  const voters = loadVoters();
  const candidates = loadCandidates();
  const votedCount = voters.filter((v) => v.hasVoted).length;

  document.getElementById("adminTotalVoters").textContent = voters.length;
  document.getElementById("adminVotesCast").textContent = votedCount;
  document.getElementById("adminNotVoted").textContent = voters.length - votedCount;
  document.getElementById("adminTurnout").textContent =
    voters.length === 0 ? "0%" : `${Math.round((votedCount / voters.length) * 100)}%`;

  renderWinnerBanner(candidates);
  renderCharts(candidates);
  renderAdminCandidateList(candidates);
  renderVoterTable(voters);
}

function renderWinnerBanner(candidates) {
  const label = document.getElementById("winnerName");
  const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);

  if (candidates.length === 0 || totalVotes === 0) {
    label.textContent = "No votes yet";
    return;
  }
  const leader = candidates.reduce((a, b) => (b.votes > a.votes ? b : a), candidates[0]);
  label.textContent = `${leader.name} (${leader.party}) — ${leader.votes} vote${leader.votes === 1 ? "" : "s"}`;
}

function renderCharts(candidates) {
  const labels = candidates.map((c) => c.name);
  const data = candidates.map((c) => c.votes);
  const palette = ["#3b82f6", "#06b6d4", "#10b981", "#f43f5e", "#fbbf24", "#a78bfa"];
  const colors = candidates.map((_, i) => palette[i % palette.length]);

  const barCtx = document.getElementById("votesBarChart").getContext("2d");
  const pieCtx = document.getElementById("votesPieChart").getContext("2d");

  if (barChartInstance) barChartInstance.destroy();
  if (pieChartInstance) pieChartInstance.destroy();

  const gridColor = "rgba(148, 163, 184, 0.12)";
  const tickColor = "#93a1b8";

  barChartInstance = new Chart(barCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Votes", data, backgroundColor: colors, borderRadius: 8, maxBarThickness: 48 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tickColor }, grid: { display: false } },
        y: { ticks: { color: tickColor, precision: 0 }, grid: { color: gridColor }, beginAtZero: true },
      },
    },
  });

  pieChartInstance = new Chart(pieCtx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: "#0a0e1a", borderWidth: 3 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { color: tickColor, boxWidth: 12, padding: 14 } } },
    },
  });
}

function renderAdminCandidateList(candidates) {
  const list = document.getElementById("adminCandidateList");
  list.innerHTML = "";

  if (candidates.length === 0) {
    list.innerHTML = `<p class="empty-note">No candidates yet. Add the first one above.</p>`;
    return;
  }

  candidates.forEach((c) => {
    const row = document.createElement("div");
    row.className = "admin-candidate-row";
    row.innerHTML = `
      <div class="admin-candidate-row__info">
        <strong>${escapeHtml(c.name)}</strong>
        <span>${escapeHtml(c.party)} &middot; ${escapeHtml(c.manifesto)}</span>
      </div>
      <div class="admin-candidate-row__count">${c.votes} vote${c.votes === 1 ? "" : "s"}</div>
      <button class="remove-btn" data-remove-id="${c.id}">Remove</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-remove-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-id");
      const candidates = loadCandidates().filter((c) => c.id !== id);
      saveCandidates(candidates);
      showToast("Candidate removed.", "success");
      renderAdminDashboard();
    });
  });
}

function renderVoterTable(voters) {
  const body = document.getElementById("adminVoterTableBody");
  body.innerHTML = "";

  if (voters.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="empty-note">No voters registered yet.</td></tr>`;
    return;
  }

  voters.forEach((v) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(v.name)}</td>
      <td>${escapeHtml(v.roll)}</td>
      <td>${escapeHtml(v.branch)}</td>
      <td>${v.hasVoted ? '<span class="pill pill--voted">Voted</span>' : '<span class="pill pill--pending">Pending</span>'}</td>
    `;
    body.appendChild(tr);
  });
}

// ---------------------------------------------------------
// ADD CANDIDATE (admin)
// ---------------------------------------------------------
const addCandidateForm = document.getElementById("addCandidateForm");
addCandidateForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const name = document.getElementById("candName").value.trim();
  const party = document.getElementById("candParty").value.trim();
  const manifesto = document.getElementById("candManifesto").value.trim();

  if (!name || !party || !manifesto) {
    showToast("Please fill in every candidate field.", "error");
    return;
  }

  const candidates = loadCandidates();
  candidates.push({ id: "c" + Date.now().toString(36), name, party, manifesto, votes: 0 });
  saveCandidates(candidates);

  addCandidateForm.reset();
  showToast(`${name} added to the ballot.`, "success");
  renderAdminDashboard();
});

// ---------------------------------------------------------
// BOOTSTRAP — restore session on page load/refresh
// ---------------------------------------------------------
function bootstrap() {
  loadCandidates(); // ensures defaults are seeded on first run
  refreshLandingStats();

  const voterId = sessionStorage.getItem(SESSION_KEYS.voterId);
  const isAdmin = sessionStorage.getItem(SESSION_KEYS.isAdmin) === "true";

  if (isAdmin) {
    renderAdminDashboard();
    showView("admin");
    return;
  }

  if (voterId) {
    const voter = loadVoters().find((v) => v.id === voterId);
    if (voter) {
      if (voter.hasVoted) {
        renderReceipt(voter);
        showView("thankyou");
      } else {
        renderVotingDashboard(voter);
        showView("vote");
      }
      return;
    }
  }

  showView("landing");
}

bootstrap();
