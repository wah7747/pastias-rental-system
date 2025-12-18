// js/auth.js
import { supabase } from "./supabase.js";

/**
 * Check if a user is logged in.
 */
export async function isLoggedIn() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Error getting session:", error);
    return false;
  }
  return !!data.session;
}

/**
 * Logout current user and send them back to login page.
 */
export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error during logout:", error);
  }
  window.location.href = "index.html";
}

/**
 * Get current user's profile (role, name, etc.) from profiles table.
 * Returns: { id, fullname, role, created_at } or null
 */
export async function getCurrentUserProfile() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getUser();

  if (sessionError || !sessionData?.user) {
    console.error("Error getting user:", sessionError);
    return null;
  }

  const userId = sessionData.user.id;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }

  return data; // { id, fullname, role, created_at }
}

/**
 * Check if current user is admin
 */
export async function isAdmin() {
  const profile = await getCurrentUserProfile();
  return profile?.role?.toLowerCase() === 'admin';
}

/**
 * Check if current user can delete (admin only)
 */
export async function canDelete() {
  return await isAdmin();
}

/**
 * Handle login click on index.html
 */
async function handleLogin() {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Login error:", error);
    alert("Login failed: " + error.message);
    return;
  }

  // success → go to dashboard
  window.location.href = "dashboard.html";
}

/**
 * Handle "Forgot password" click: send reset email.
 */
async function handleForgotPassword() {
  const email = prompt("Enter your email to reset password:");
  if (!email) return;

  // Dynamically construct the reset URL based on current origin
  const resetUrl = `${window.location.origin}/reset.html`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetUrl,
  });

  if (error) {
    console.error("Reset password error:", error);
    alert("Failed to send reset email: " + error.message);
    return;
  }

  alert("Password reset email sent! Check your inbox.");
}

/**
 * Only used on index.html – attach login + forgot password handlers.
 */
function setupLoginPage() {
  const loginForm = document.getElementById("loginForm");
  const loginBtn = document.getElementById("loginButton");

  // Handle form submission (Enter key)
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleLogin();
    });
  }

  // Also handle direct button click (for good measure)
  if (loginBtn) {
    loginBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleLogin();
    });
  }

  const forgotLink = document.getElementById("forgotPassword");
  if (forgotLink) {
    forgotLink.addEventListener("click", (e) => {
      e.preventDefault();
      handleForgotPassword();
    });
  }
}

// Auto-attach when on login page
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("loginButton")) {
    setupLoginPage();
  }
});
