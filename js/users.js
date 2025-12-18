// js/users.js
import { supabase } from "./supabase.js";
import { getCurrentUserProfile, isLoggedIn } from "./auth.js";

let currentUser = null;
let editUserId = null;

// DOM Elements
const addUserBtn = document.getElementById("addUserBtn");
const modal = document.getElementById("editUserModal");
const modalOverlay = document.getElementById("editUserOverlay");
const saveUserBtn = document.getElementById("saveUserBtn");
const cancelUserBtn = document.getElementById("cancelUserBtn");
const modalTitle = document.getElementById("modalTitle");

const userFullname = document.getElementById("userFullname");
const userEmail = document.getElementById("userEmail");
const userRole = document.getElementById("userRole");

const tbody = document.getElementById("usersTableBody");
const emptyHint = document.getElementById("usersEmptyHint");

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  const logged = await isLoggedIn();
  if (!logged) {
    window.location.href = "index.html";
    return;
  }

  currentUser = await getCurrentUserProfile();
  if (currentUser) {
    document.getElementById("welcomeUser").innerText = `Welcome, ${currentUser.fullname}`;
  }

  // Check if user is admin
  await ensureAdmin();
  await loadUsers();
});

// Ensure only admins can access
async function ensureAdmin() {
  const role = currentUser?.role?.toLowerCase?.() ?? "staff";
  if (role !== "admin") {
    alert("Only admins can access the Users page.");
    window.location.href = "dashboard.html";
  }
}

// Load users from database
async function loadUsers() {
  tbody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";
  emptyHint.style.display = "none";

  try {
    // Fetch profiles (email not available client-side from auth.users)
    const { data, error } = await supabase
      .from("profiles")
      .select("id, fullname, role, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading users:", error);
      tbody.innerHTML = `<tr><td colspan='4'>Failed to load users: ${error.message}</td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = "";
      emptyHint.style.display = "block";
      return;
    }

    renderUsers(data);
  } catch (err) {
    console.error("Unexpected error:", err);
    tbody.innerHTML = `<tr><td colspan='4'>Error: ${err.message}</td></tr>`;
  }
}

// Render users table
function renderUsers(users) {
  tbody.innerHTML = "";

  users.forEach(user => {
    const tr = document.createElement("tr");

    const roleBadge = getRoleBadge(user.role);
    const isCurrentUser = user.id === currentUser?.id;

    // Show user ID (first 8 chars)
    const userIdShort = user.id ? user.id.substring(0, 8) + "..." : "N/A";

    tr.innerHTML = `
      <td>${user.fullname || "(no name)"}</td>
      <td title="${user.id}">${userIdShort}</td>
      <td>${roleBadge}</td>
      <td>
        <button class="btn-edit" onclick="editUser('${user.id}')" style="padding: 6px 12px; margin: 2px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">✏️ Edit</button>
        ${!isCurrentUser ? `<button class="btn-delete" onclick="deleteUser('${user.id}', '${user.fullname}')" style="padding: 6px 12px; margin: 2px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">🗑️ Delete</button>` : ''}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// Get role badge HTML with color coding
function getRoleBadge(role) {
  const roleLower = (role || "staff").toLowerCase();
  const colors = {
    admin: 'background: #ef4444; color: white;',
    staff: 'background: #3b82f6; color: white;',
    viewer: 'background: #10b981; color: white;'
  };

  const color = colors[roleLower] || colors.staff;
  const roleText = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Staff";

  return `<span style="padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; ${color}">${roleText}</span>`;
}

// Add User button - open modal
addUserBtn?.addEventListener("click", () => {
  const addModal = document.getElementById("addUserModal");
  if (addModal) {
    addModal.classList.remove("hidden");
    addModal.setAttribute("aria-hidden", "false");
    document.getElementById("newUserFullname")?.focus();
  }
});

// Edit User
window.editUser = async function (userId) {
  editUserId = userId;
  modalTitle.textContent = "Edit User";

  // Fetch user data
  const { data, error } = await supabase
    .from("profiles")
    .select("id, fullname, role")
    .eq("id", userId)
    .single();

  if (error || !data) {
    alert("Failed to load user details.");
    return;
  }

  // Populate form
  userFullname.value = data.fullname || "";
  userEmail.value = data.id; // Show user ID
  userRole.value = (data.role || "staff").toLowerCase();

  // Show modal
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  userFullname.focus();
};

// Delete User
window.deleteUser = async function (userId, fullname) {
  if (!confirm(`Are you sure you want to delete ${fullname}? This action cannot be undone.`)) {
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (error) {
    console.error("Error deleting user:", error);
    alert(`Failed to delete user: ${error.message}`);
    return;
  }

  alert(`User ${fullname} has been deleted.`);
  await loadUsers();
};

// Save user changes
document.getElementById("editUserForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullname = userFullname.value.trim();
  const role = userRole.value;

  if (!fullname) {
    alert("Please enter a full name.");
    return;
  }

  saveUserBtn.disabled = true;

  try {
    const { error } = await supabase
      .from("profiles")
      .update({ fullname, role })
      .eq("id", editUserId);

    if (error) {
      console.error("Error updating user:", error);
      alert(`Failed to update user: ${error.message}`);
      return;
    }

    closeModal();
    await loadUsers();
  } catch (err) {
    console.error("Unexpected error:", err);
    alert(`Error: ${err.message}`);
  } finally {
    saveUserBtn.disabled = false;
  }
});

// Close modal handlers
cancelUserBtn?.addEventListener("click", closeModal);
modalOverlay?.addEventListener("click", closeModal);

function closeModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  editUserId = null;
  document.getElementById("editUserForm").reset();
}

// Add User Modal handlers
const addModal = document.getElementById("addUserModal");
const addModalOverlay = document.getElementById("addUserOverlay");
const cancelAddUserBtn = document.getElementById("cancelAddUserBtn");
const saveNewUserBtn = document.getElementById("saveNewUserBtn");

cancelAddUserBtn?.addEventListener("click", closeAddModal);
addModalOverlay?.addEventListener("click", closeAddModal);

function closeAddModal() {
  addModal?.classList.add("hidden");
  addModal?.setAttribute("aria-hidden", "true");
  document.getElementById("addUserForm")?.reset();
}

// Create new user
document.getElementById("addUserForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullname = document.getElementById("newUserFullname").value.trim();
  const email = document.getElementById("newUserEmail").value.trim();
  const password = document.getElementById("newUserPassword").value;
  const role = document.getElementById("newUserRole").value;

  if (!fullname || !email || !password) {
    alert("Please fill in all fields.");
    return;
  }

  saveNewUserBtn.disabled = true;

  try {
    // Step 1: Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      console.error("Error creating user:", authError);
      alert(`Failed to create user: ${authError.message}`);
      saveNewUserBtn.disabled = false;
      return;
    }

    if (!authData.user) {
      alert("Failed to create user account.");
      saveNewUserBtn.disabled = false;
      return;
    }

    // Step 2: Create profile entry with name and role
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: authData.user.id,
        fullname,
        role,
      });

    if (profileError) {
      console.error("Error creating profile:", profileError);
      alert(`User account created, but failed to set profile: ${profileError.message}`);
      saveNewUserBtn.disabled = false;
      return;
    }

    alert(`User ${fullname} created successfully!`);
    closeAddModal();
    await loadUsers();
  } catch (err) {
    console.error("Unexpected error:", err);
    alert(`Error: ${err.message}`);
  } finally {
    saveNewUserBtn.disabled = false;
  }
});
