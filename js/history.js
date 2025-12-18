// js/history.js
import { supabase } from "./supabase.js";
import { isLoggedIn, getCurrentUserProfile, canDelete } from "./auth.js";

let allHistory = [];
let userCanDelete = false;

document.addEventListener("DOMContentLoaded", async () => {
    const logged = await isLoggedIn();
    if (!logged) {
        window.location.href = "index.html";
        return;
    }

    const profile = await getCurrentUserProfile();
    if (profile) {
        document.getElementById("welcomeUser").innerText = `Welcome, ${profile.fullname}`;
    }

    // Check if user can delete
    userCanDelete = await canDelete();

    await loadHistory();
    await loadUsers();

    // Filter handlers
    document.getElementById("filterAction")?.addEventListener("change", filterHistory);
    document.getElementById("filterUser")?.addEventListener("change", filterHistory);
});

async function loadHistory() {
    // Fetch inventory history
    const { data: inventoryHistory, error: invError } = await supabase
        .from("inventory_history")
        .select("*")
        .order("created_at", { ascending: false });

    // Fetch decoration history
    const { data: decorationHistory, error: decoError } = await supabase
        .from("decoration_history")
        .select("*")
        .order("created_at", { ascending: false });

    if (invError) {
        console.error("Error loading inventory history:", invError);
    }

    if (decoError) {
        console.error("Error loading decoration history:", decoError);
    }

    // Merge both histories and add source table tracking
    const inventoryWithSource = (inventoryHistory || []).map(function (entry) {
        return Object.assign({}, entry, { _sourceTable: 'inventory_history' });
    });

    const decorationWithSource = (decorationHistory || []).map(function (entry) {
        return Object.assign({}, entry, { _sourceTable: 'decoration_history' });
    });

    const combinedHistory = inventoryWithSource.concat(decorationWithSource);
    combinedHistory.sort(function (a, b) {
        return new Date(b.created_at) - new Date(a.created_at);
    });

    // Debug logging
    console.log("Inventory:", inventoryHistory ? inventoryHistory.length : 0, "Decorations:", decorationHistory ? decorationHistory.length : 0);
    console.log("Combined:", combinedHistory.length, "IDs:", combinedHistory.map(function (e) { return e.id; }));

    allHistory = combinedHistory;
    renderHistory(allHistory);
}

async function loadUsers() {
    // Get unique users from history
    const uniqueUsers = [...new Set(allHistory.map(h => h.user_name).filter(Boolean))];

    const filterUser = document.getElementById("filterUser");
    uniqueUsers.forEach(userName => {
        const option = document.createElement("option");
        option.value = userName;
        option.textContent = userName;
        filterUser.appendChild(option);
    });
}

function filterHistory() {
    const actionFilter = document.getElementById("filterAction").value;
    const userFilter = document.getElementById("filterUser").value;

    let filtered = allHistory;

    if (actionFilter !== "all") {
        filtered = filtered.filter(h => h.action === actionFilter);
    }

    if (userFilter !== "all") {
        filtered = filtered.filter(h => h.user_name === userFilter);
    }

    renderHistory(filtered);
}

function renderHistory(history) {
    const tbody = document.getElementById("historyTableBody");
    const emptyHint = document.getElementById("historyEmptyHint");

    if (!history || history.length === 0) {
        tbody.innerHTML = "";
        emptyHint.style.display = "block";
        return;
    }

    emptyHint.style.display = "none";
    tbody.innerHTML = "";

    history.forEach(function (entry) {
        const tr = document.createElement("tr");

        const timestamp = new Date(entry.created_at).toLocaleString();
        const actionBadge = getActionBadge(entry.action);
        const details = formatDetails(entry.details);

        // Only show delete button if user has permission - use data attribute instead of onclick
        const deleteButton = userCanDelete
            ? '<button class="btn-delete-history" data-entry-id="' + entry.id + '" style="padding: 6px 12px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Delete</button>'
            : '<span style="color: #9ca3af; font-size: 12px;">No permission</span>';

        tr.innerHTML =
            '<td>' + timestamp + '</td>' +
            '<td>' + (entry.user_name || "Unknown") + '</td>' +
            '<td>' + actionBadge + '</td>' +
            '<td>' + entry.item_name + '</td>' +
            '<td>' + details + '</td>' +
            '<td>' + deleteButton + '</td>';

        tbody.appendChild(tr);
    });

    // Add event delegation for delete buttons
    tbody.removeEventListener('click', handleHistoryDelete);
    tbody.addEventListener('click', handleHistoryDelete);
}

function getActionBadge(action) {
    const badges = {
        added: '<span class="status-badge" style="background: #d1fae5; color: #065f46;">Added</span>',
        updated: '<span class="status-badge" style="background: #dbeafe; color: #1e40af;">Updated</span>',
        deleted: '<span class="status-badge" style="background: #fee2e2; color: #991b1b;">Deleted</span>'
    };
    return badges[action] || action;
}

function formatDetails(details) {
    if (!details) return "-";

    try {
        const parsed = typeof details === 'string' ? JSON.parse(details) : details;

        if (parsed.changes) {
            return Object.entries(parsed.changes)
                .map(([key, value]) => {
                    const fieldName = key.replace('_', ' ').replace(/([A-Z])/g, ' $1').trim();
                    const capitalizedField = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);

                    // Format price values
                    if (key.includes('price') && typeof value === 'object') {
                        const oldVal = value.old != null ? `₱${parseFloat(value.old).toFixed(2)}` : 'N/A';
                        const newVal = value.new != null ? `₱${parseFloat(value.new).toFixed(2)}` : 'N/A';
                        return `${capitalizedField}: ${oldVal} → ${newVal}`;
                    }

                    // Regular fields
                    if (typeof value === 'object' && value.old !== undefined && value.new !== undefined) {
                        return `${capitalizedField}: ${value.old} → ${value.new}`;
                    }

                    return `${capitalizedField}: ${value}`;
                })
                .join("<br>");
        }

        if (parsed.quantity) {
            return `Quantity: ${parsed.quantity}`;
        }

        if (parsed.category) {
            return `Category: ${parsed.category}`;
        }

        return JSON.stringify(parsed);
    } catch (e) {
        return String(details);
    }
}

// Delete history entry
async function deleteHistoryEntry(entryId) {
    console.log("deleteHistoryEntry called with ID:", entryId);
    console.log("allHistory length:", allHistory.length);
    console.log("userCanDelete:", userCanDelete);

    // Check permission
    if (!userCanDelete) {
        alert("You don't have permission to delete history entries. Only admins can perform this action.");
        return;
    }

    if (!confirm("Are you sure you want to delete this history entry? This cannot be undone.")) {
        return;
    }

    // Find the entry to determine which table to delete from - use String() for type-safe comparison
    console.log("Searching for ID:", entryId, "Type:", typeof entryId);
    console.log("All history IDs:", allHistory.map(function (e) {
        return { id: e.id, type: typeof e.id, stringMatch: String(e.id) === String(entryId) };
    }));

    const entry = allHistory.find(function (e) {
        return String(e.id) === String(entryId);
    });

    if (!entry) {
        alert("History entry not found.");
        console.error("Entry ID not found in allHistory:", entryId, "Available IDs:", allHistory.map(function (e) { return e.id; }));
        return;
    }

    const tableName = entry._sourceTable || 'inventory_history';

    const { error } = await supabase
        .from(tableName)
        .delete()
        .eq("id", entryId);

    if (error) {
        console.error("Error deleting history entry:", error);
        alert("Failed to delete history entry: " + error.message);
        return;
    }

    // Reload history
    await loadHistory();
}

// Event handler for delete button clicks
function handleHistoryDelete(event) {
    const deleteBtn = event.target.closest('.btn-delete-history');
    if (deleteBtn) {
        const entryId = parseInt(deleteBtn.getAttribute('data-entry-id'));
        deleteHistoryEntry(entryId);
    }
}
