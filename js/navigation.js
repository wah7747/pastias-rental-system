// js/navigation.js
import { supabase } from "./supabase.js";
import {
  getCurrentUserProfile,
  logoutUser,
  isLoggedIn,
} from "./auth.js";

/**
 * Protect page: redirect to login if not logged in
 */
async function requireAuth() {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    window.location.href = "index.html";
  }
}

/**
 * Update "Welcome, User" text and role-based UI
 */
async function setupUserHeaderAndRole() {
  const welcomeEl = document.getElementById("welcomeUser");
  const usersNav = document.getElementById("navUsers"); // <li> or <a> for Users menu

  const profile = await getCurrentUserProfile();
  if (!profile) {
    if (welcomeEl) welcomeEl.textContent = "Welcome, User";
    if (usersNav) usersNav.style.display = "none";
    return;
  }

  const name = profile.fullname || "User";
  const role = (profile.role || "").toLowerCase();

  if (welcomeEl) {
    welcomeEl.textContent = `Welcome, ${name}`;
  }

  // Role-based UI: only admins see Users menu
  if (usersNav) {
    if (role === "admin") {
      usersNav.style.display = "flex";
    } else {
      usersNav.style.display = "none";
    }
  }
}

/**
 * Highlight active nav item based on data-page attribute in <body>
 */
function highlightActiveNav() {
  const bodyPage = document.body.dataset.page; // e.g. "dashboard", "inventory"

  if (!bodyPage) return;
  const link = document.querySelector(
    `.sidebar-nav a[data-nav="${bodyPage}"]`
  );
  if (link) {
    link.classList.add("active");
  }
}

/**
 * Hook logout button
 */
function setupLogoutButton() {
  const logoutBtn = document.getElementById("logoutButton");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      logoutUser();
    });
  }
}

/**
 * Initialize navigation for protected pages
 */
async function initNavigation() {
  await requireAuth();
  await setupUserHeaderAndRole();
  highlightActiveNav();
  setupLogoutButton();
}

// Run on every internal page (not index.html)
document.addEventListener("DOMContentLoaded", () => {
  // if we’re not on the login page:
  if (!document.getElementById("loginButton")) {
    initNavigation();
  }
});
