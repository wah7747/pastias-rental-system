import { supabase } from "./supabase.js";
import { isLoggedIn, logoutUser, getCurrentUserProfile, canDelete } from "./auth.js";

// ========== SHARED STATE ==========
let currentUser = null;
let currentData = [];
let editItemId = null;

// ========== DECORATIONS STATE ==========
let decorationsData = [];
let editDecorationId = null;

// ========== TAB SWITCHING ==========
document.addEventListener("DOMContentLoaded", async () => {
    const logged = await isLoggedIn();
    if (!logged) {
        window.location.href = "index.html";
        return;
    }

    const profile = await getCurrentUserProfile();
    if (profile) {
        currentUser = profile;
        document.getElementById("welcomeUser").innerText =
            `Welcome, ${profile.fullname}`;
    }

    setupTabs();
    loadInventory();
    loadDecorations();

    // Check if we should auto-open the Add Item modal (from Quick Actions)
    if (sessionStorage.getItem("openAddItemModal")) {
        sessionStorage.removeItem("openAddItemModal");
        // Wait slightly for DOM to be ready if needed, though here it's fine
        setTimeout(() => {
            if (itemModal) {
                itemModal.classList.remove("hidden");
                itemModal.setAttribute("aria-hidden", "false");
                itemName?.focus();
            }
        }, 100);
    }
});

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');

            // Update button states
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update content visibility
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            if (tab === 'items') {
                document.getElementById('itemsTab').classList.add('active');
            } else if (tab === 'decorations') {
                document.getElementById('decorationsTab').classList.add('active');
            }
        });
    });
}

// ========== INVENTORY ITEMS ==========
const addItemBtn = document.getElementById("addItemBtn");
const itemModal = document.getElementById("addItemModal");
const itemModalOverlay = document.getElementById("addItemOverlay");
const saveItemBtn = document.getElementById("saveItemBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");

const itemName = document.getElementById("itemName");
const itemCategory = document.getElementById("itemCategory");
const itemTotal = document.getElementById("itemTotal");
const itemDamaged = document.getElementById("itemDamaged");
const itemRentalPrice = document.getElementById("itemRentalPrice");
const addCategoryBtn = document.getElementById("addCategoryBtn");

const tbody = document.getElementById("inventoryTableBody");
const emptyHint = document.getElementById("inventoryEmptyHint");
const searchInput = document.getElementById("searchInventory");
const filterCategory = document.getElementById("filterCategory");

addItemBtn?.addEventListener("click", () => {
    itemModal.classList.remove("hidden");
    itemModal.setAttribute("aria-hidden", "false");
    document.getElementById("itemName")?.focus();
    editItemId = null;
});

cancelModalBtn?.addEventListener("click", () => {
    closeItemModal();
});

itemModalOverlay?.addEventListener("click", () => {
    closeItemModal();
});

addCategoryBtn?.addEventListener("click", () => {
    const newCat = prompt("Enter new category name:");
    if (newCat && newCat.trim()) {
        const catTrim = newCat.trim();
        itemCategory.innerHTML += `<option value="${catTrim}">${catTrim}</option>`;
        itemCategory.value = catTrim;
    }
});

function closeItemModal() {
    itemModal.classList.add("hidden");
    itemModal.setAttribute("aria-hidden", "true");
    itemName.value = "";
    itemCategory.value = "";
    itemTotal.value = "";
    itemDamaged.value = "0";
    itemRentalPrice.value = "";
}

saveItemBtn?.addEventListener("click", async () => {
    const name = itemName.value.trim();
    const category = itemCategory.value.trim();
    const total = parseInt(itemTotal.value);
    const damaged = parseInt(itemDamaged.value) || 0;
    const rentalPrice = parseFloat(itemRentalPrice.value) || 0;

    if (!name || !category || isNaN(total)) {
        alert("Please fill all required fields correctly.");
        return;
    }

    if (total < 0) {
        alert("Total quantity cannot be negative.");
        return;
    }

    if (damaged < 0) {
        alert("Damaged quantity cannot be negative.");
        return;
    }

    if (damaged > total) {
        alert("Damaged quantity cannot exceed total quantity.");
        return;
    }

    saveItemBtn.disabled = true;
    try {
        if (editItemId) {
            // Get the old item data before updating
            const oldItem = currentData.find(i => i.id === editItemId);

            const payload = {
                name,
                category,
                quantity_total: total,
                quantity_available: total,
                quantity_damaged: damaged,
                rental_price: rentalPrice
            };

            const { data, error } = await supabase.from("inventory_items").update(payload).eq('id', editItemId).select();
            if (error) {
                console.error("Update error:", error);
                alert(`Failed to update item. ${error.message || JSON.stringify(error)}`);
                return;
            }

            await logInventoryHistory('updated', editItemId, name, {
                changes: {
                    quantity: { old: oldItem?.quantity_total, new: total },
                    damaged: { old: oldItem?.quantity_damaged || 0, new: damaged },
                    rental_price: { old: oldItem?.rental_price, new: rentalPrice }
                }
            });
        } else {
            const payload = {
                name,
                category,
                quantity_total: total,
                quantity_available: total,
                quantity_damaged: damaged,
                rental_price: rentalPrice
            };

            const { data, error } = await supabase.from("inventory_items").insert(payload).select();
            if (error) {
                console.error("Insert error:", error);
                alert(`Failed to add item. ${error.message || JSON.stringify(error)}`);
                return;
            }

            if (data && data[0]) {
                await logInventoryHistory('added', data[0].id, name, {
                    quantity: total,
                    damaged: damaged,
                    category: category
                });
            }
        }

        closeItemModal();
        await loadInventory();
    } catch (err) {
        console.error("Unexpected error while saving item:", err);
        alert(`Unexpected error: ${err.message || JSON.stringify(err)}`);
    } finally {
        saveItemBtn.disabled = false;
    }
});

async function loadInventory() {
    const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("archived", false)
        .order("name", { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    tbody.innerHTML = "";

    if (!data || data.length === 0) {
        emptyHint.style.display = "block";
        currentData = [];
        populateCategoryFilter([]);
        return;
    }

    emptyHint.style.display = "none";
    currentData = data;

    // Fetch active rentals to calculate real-time availability
    const { data: rentals, error: rentalError } = await supabase
        .from("rentals")
        .select("item_id, quantity")
        .in("status", ["active", "reserved", "overdue"])
        .or('archived.is.null,archived.eq.false');

    if (rentalError) {
        console.error("Error fetching rentals:", rentalError);
    }

    // Calculate rented quantities per item
    const rentedMap = {};
    if (rentals && rentals.length > 0) {
        rentals.forEach(rental => {
            if (rental.item_id) {
                rentedMap[rental.item_id] = (rentedMap[rental.item_id] || 0) + (rental.quantity || 0);
            }
        });
    }

    // Add calculated availability to items
    const itemsWithAvailability = data.map(item => ({
        ...item,
        currentlyRented: rentedMap[item.id] || 0,
        damagedQty: item.quantity_damaged || 0,
        realTimeAvailable: item.quantity_total - (rentedMap[item.id] || 0) - (item.quantity_damaged || 0)
    }));

    currentData = itemsWithAvailability;
    populateCategoryFilter(itemsWithAvailability);
    renderItemsTable(itemsWithAvailability);
}

function renderItemsTable(data) {
    tbody.innerHTML = "";
    // Check if user is admin to show delete buttons
    const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

    data.forEach(item => {
        // Use real-time calculated availability if available, otherwise fall back to database value
        const available = item.realTimeAvailable ?? (item.quantity_available ?? item.quantity_total);
        const rented = item.currentlyRented || 0;
        const damaged = item.damagedQty || item.quantity_damaged || 0;
        const price = item.rental_price ? `₱${parseFloat(item.rental_price).toFixed(2)}` : '₱0.00';

        // Add visual indicator if items are currently rented
        const availableDisplay = rented > 0
            ? `${available} <span style="color: #ff9800; font-size: 0.85em; font-weight: 600;" title="${rented} currently rented">(${rented} rented)</span>`
            : available;

        // Highlight row if availability is low
        const rowStyle = available <= 0 ? 'background-color: #ffebee;' : '';

        // Action buttons: show delete only for admins
        const actionButtons = isAdmin
            ? `<button class="btn-edit" data-id="${item.id}">Edit</button>
               <button class="btn-delete" data-id="${item.id}">Delete</button>`
            : `<button class="btn-edit" data-id="${item.id}">Edit</button>
               <span style="color: #999; font-size: 0.85em; font-style: italic;">No permission</span>`;

        tbody.innerHTML += `
            <tr data-id="${item.id}" style="${rowStyle}">
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>${item.quantity_total}</td>
                <td>${damaged > 0 ? `<span style="color: #f44336; font-weight: 600;">${damaged}</span>` : damaged}</td>
                <td>${availableDisplay}</td>
                <td>${price}</td>
                <td>
                    ${actionButtons}
                </td>
            </tr>
        `;
    });
}

function populateCategoryFilter(items) {
    const cats = Array.from(new Set(items.map(i => i.category).filter(Boolean)));
    filterCategory.innerHTML = '<option value="all">All</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');

    const categorySelect = document.getElementById("itemCategory");
    categorySelect.innerHTML = '<option value="">-- Select Category --</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

tbody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const delBtn = e.target.closest('.btn-delete');
    if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        openEditItemModal(id);
    } else if (delBtn) {
        const id = delBtn.getAttribute('data-id');
        if (confirm('Delete this item?')) {
            await deleteItem(id);
        }
    }
});

async function openEditItemModal(id) {
    const item = currentData.find(d => String(d.id) === String(id));
    if (!item) return alert('Item not found');
    editItemId = item.id;
    itemName.value = item.name || '';
    itemCategory.value = item.category || '';
    itemTotal.value = item.quantity_total ?? '';
    itemDamaged.value = item.quantity_damaged ?? 0;
    itemRentalPrice.value = item.rental_price ?? '';
    itemModal.classList.remove('hidden');
    itemModal.setAttribute('aria-hidden', 'false');
}

async function deleteItem(id) {
    // Check permission
    if (!await canDelete()) {
        alert("Permission denied. Only Admins can delete items.");
        return;
    }

    try {
        // Get item details before archiving for history logging
        const item = currentData.find(i => i.id === parseInt(id));

        const { error } = await supabase
            .from('inventory_items')
            .update({ archived: true })
            .eq('id', id);
        if (error) {
            alert('Failed to archive item. ' + (error.message || JSON.stringify(error)));
            return;
        }

        // Log deletion to history
        if (item) {
            await logInventoryHistory('deleted', item.id, item.name, {
                category: item.category,
                quantity: item.quantity_total
            });
        }

        await loadInventory();
    } catch (err) {
        alert('Unexpected error archiving item.');
    }
}

searchInput?.addEventListener('input', () => applyItemFilters());
filterCategory?.addEventListener('change', () => applyItemFilters());

function applyItemFilters() {
    const q = (searchInput?.value || '').toLowerCase().trim();
    const cat = filterCategory?.value || 'all';
    let filtered = currentData.slice();
    if (cat !== 'all') filtered = filtered.filter(i => String(i.category) === String(cat));
    if (q) filtered = filtered.filter(i => (i.name || '').toLowerCase().includes(q));
    renderItemsTable(filtered);
}

// ========== DECORATIONS ==========
const addDecorationBtn = document.getElementById("addDecorationBtn");
const decorationModal = document.getElementById("addDecorationModal");
const decorationModalOverlay = document.getElementById("addDecorationOverlay");
const saveDecorationBtn = document.getElementById("saveDecorationBtn");
const cancelDecorationModalBtn = document.getElementById("cancelDecorationModalBtn");

const decorationName = document.getElementById("decorationName");
const decorationType = document.getElementById("decorationType");
const decorationTotal = document.getElementById("decorationTotal");
const decorationDamaged = document.getElementById("decorationDamaged");
const decorationRentalPrice = document.getElementById("decorationRentalPrice");
const addDecorationTypeBtn = document.getElementById("addDecorationTypeBtn");

const decorationsTbody = document.getElementById("decorationsTableBody");
const decorationsEmptyHint = document.getElementById("decorationsEmptyHint");
const searchDecorations = document.getElementById("searchDecorations");
const filterDecorationType = document.getElementById("filterDecorationType");

addDecorationBtn?.addEventListener("click", () => {
    decorationModal.classList.remove("hidden");
    decorationModal.setAttribute("aria-hidden", "false");
    document.getElementById("decorationName")?.focus();
    editDecorationId = null;
});

cancelDecorationModalBtn?.addEventListener("click", () => {
    closeDecorationModal();
});

decorationModalOverlay?.addEventListener("click", () => {
    closeDecorationModal();
});

addDecorationTypeBtn?.addEventListener("click", () => {
    const newType = prompt("Enter new decoration type:");
    if (newType && newType.trim()) {
        const typeTrim = newType.trim();
        decorationType.innerHTML += `<option value="${typeTrim}">${typeTrim}</option>`;
        decorationType.value = typeTrim;
    }
});

function closeDecorationModal() {
    decorationModal.classList.add("hidden");
    decorationModal.setAttribute("aria-hidden", "true");
    decorationName.value = "";
    decorationType.value = "";
    decorationTotal.value = "";
    decorationDamaged.value = "0";
    decorationRentalPrice.value = "";
}

saveDecorationBtn?.addEventListener("click", async () => {
    const name = decorationName.value.trim();
    const type = decorationType.value.trim();
    const total = parseInt(decorationTotal.value);
    const damaged = parseInt(decorationDamaged.value) || 0;
    const rentalPrice = parseFloat(decorationRentalPrice.value) || 0;

    if (!name || !type || isNaN(total)) {
        alert("Please fill all required fields correctly.");
        return;
    }

    if (total < 0) {
        alert("Total quantity cannot be negative.");
        return;
    }

    if (damaged < 0) {
        alert("Damaged quantity cannot be negative.");
        return;
    }

    if (damaged > total) {
        alert("Damaged quantity cannot exceed total quantity.");
        return;
    }

    saveDecorationBtn.disabled = true;
    try {
        if (editDecorationId) {
            // Get the old decoration data before updating
            const oldDecoration = decorationsData.find(d => d.id === editDecorationId);

            const payload = {
                name,
                type,
                quantity_total: total,
                quantity_available: total,
                quantity_damaged: damaged,
                rental_price: rentalPrice
            };

            const { data, error } = await supabase.from("decorations").update(payload).eq('id', editDecorationId).select();
            if (error) {
                console.error("Update error:", error);
                alert(`Failed to update decoration. ${error.message || JSON.stringify(error)}`);
                return;
            }

            await logDecorationHistory('updated', editDecorationId, name, {
                changes: {
                    quantity: { old: oldDecoration?.quantity_total, new: total },
                    damaged: { old: oldDecoration?.quantity_damaged || 0, new: damaged },
                    rental_price: { old: oldDecoration?.rental_price, new: rentalPrice }
                }
            });
        } else {
            const payload = {
                name,
                type,
                quantity_total: total,
                quantity_available: total,
                quantity_damaged: damaged,
                rental_price: rentalPrice
            };

            const { data, error } = await supabase.from("decorations").insert(payload).select();
            if (error) {
                console.error("Insert error:", error);
                alert(`Failed to add decoration. ${error.message || JSON.stringify(error)}`);
                return;
            }

            if (data && data[0]) {
                await logDecorationHistory('added', data[0].id, name, {
                    quantity: total,
                    damaged: damaged,
                    type: type
                });
            }
        }

        closeDecorationModal();
        await loadDecorations();
    } catch (err) {
        console.error("Unexpected error while saving decoration:", err);
        alert(`Unexpected error: ${err.message || JSON.stringify(err)}`);
    } finally {
        saveDecorationBtn.disabled = false;
    }
});

async function loadDecorations() {
    const { data, error } = await supabase
        .from("decorations")
        .select("*")
        .eq("archived", false)
        .order("name", { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    decorationsTbody.innerHTML = "";

    if (!data || data.length === 0) {
        decorationsEmptyHint.style.display = "block";
        decorationsData = [];
        populateDecorationTypeFilter([]);
        return;
    }

    decorationsEmptyHint.style.display = "none";
    decorationsData = data;

    // Fetch active rentals for decorations to calculate real-time availability
    // Note: This assumes decorations can be rented through the rentals table
    // If decorations have a separate rental system, adjust the query accordingly
    const { data: rentals, error: rentalError } = await supabase
        .from("rentals")
        .select("item_id, quantity")
        .in("status", ["active", "reserved", "overdue"])
        .or('archived.is.null,archived.eq.false');

    if (rentalError) {
        console.error("Error fetching decoration rentals:", rentalError);
    }

    // Calculate rented quantities per decoration
    const rentedMap = {};
    if (rentals && rentals.length > 0) {
        rentals.forEach(rental => {
            if (rental.item_id) {
                rentedMap[rental.item_id] = (rentedMap[rental.item_id] || 0) + (rental.quantity || 0);
            }
        });
    }

    // Add calculated availability to decorations
    const decorationsWithAvailability = data.map(item => ({
        ...item,
        currentlyRented: rentedMap[item.id] || 0,
        damagedQty: item.quantity_damaged || 0,
        realTimeAvailable: item.quantity_total - (rentedMap[item.id] || 0) - (item.quantity_damaged || 0)
    }));

    decorationsData = decorationsWithAvailability;
    populateDecorationTypeFilter(decorationsWithAvailability);
    renderDecorationsTable(decorationsWithAvailability);
}

function renderDecorationsTable(data) {
    decorationsTbody.innerHTML = "";
    // Check if user is admin to show delete buttons
    const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

    data.forEach(item => {
        // Use real-time calculated availability if available, otherwise fall back to database value
        const available = item.realTimeAvailable ?? (item.quantity_available ?? item.quantity_total);
        const rented = item.currentlyRented || 0;
        const damaged = item.damagedQty || item.quantity_damaged || 0;
        const price = item.rental_price ? `₱${parseFloat(item.rental_price).toFixed(2)}` : '₱0.00';

        // Add visual indicator if items are currently rented
        const availableDisplay = rented > 0
            ? `${available} <span style="color: #ff9800; font-size: 0.85em; font-weight: 600;" title="${rented} currently rented">(${rented} rented)</span>`
            : available;

        // Highlight row if availability is low
        const rowStyle = available <= 0 ? 'background-color: #ffebee;' : '';

        // Action buttons: show delete only for admins
        const actionButtons = isAdmin
            ? `<button class="btn-edit-decoration" data-id="${item.id}">Edit</button>
               <button class="btn-delete-decoration" data-id="${item.id}">Delete</button>`
            : `<button class="btn-edit-decoration" data-id="${item.id}">Edit</button>
               <span style="color: #999; font-size: 0.85em; font-style: italic;">No permission</span>`;

        decorationsTbody.innerHTML += `
            <tr data-id="${item.id}" style="${rowStyle}">
                <td>${item.name}</td>
                <td>${item.type}</td>
                <td>${item.quantity_total}</td>
                <td>${damaged > 0 ? `<span style="color: #f44336; font-weight: 600;">${damaged}</span>` : damaged}</td>
                <td>${availableDisplay}</td>
                <td>${price}</td>
                <td>
                    ${actionButtons}
                </td>
            </tr>
        `;
    });
}

function populateDecorationTypeFilter(items) {
    const types = Array.from(new Set(items.map(i => i.type).filter(Boolean)));
    filterDecorationType.innerHTML = '<option value="all">All Types</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');

    const typeSelect = document.getElementById("decorationType");
    typeSelect.innerHTML = '<option value="">-- Select Type --</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
}

decorationsTbody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.btn-edit-decoration');
    const delBtn = e.target.closest('.btn-delete-decoration');
    if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        openEditDecorationModal(id);
    } else if (delBtn) {
        const id = delBtn.getAttribute('data-id');
        if (confirm('Delete this decoration?')) {
            await deleteDecoration(id);
        }
    }
});

async function openEditDecorationModal(id) {
    const item = decorationsData.find(d => String(d.id) === String(id));
    if (!item) return alert('Decoration not found');
    editDecorationId = item.id;
    decorationName.value = item.name || '';
    decorationType.value = item.type || '';
    decorationTotal.value = item.quantity_total ?? '';
    decorationDamaged.value = item.quantity_damaged ?? 0;
    decorationRentalPrice.value = item.rental_price ?? '';
    decorationModal.classList.remove('hidden');
    decorationModal.setAttribute('aria-hidden', 'false');
}

async function deleteDecoration(id) {
    // Check permission
    if (!await canDelete()) {
        alert("Permission denied. Only Admins can delete decorations.");
        return;
    }

    try {
        // Get decoration details before archiving for history logging
        const decoration = decorationsData.find(d => d.id === parseInt(id));

        const { error } = await supabase
            .from('decorations')
            .update({ archived: true })
            .eq('id', id);
        if (error) {
            alert('Failed to archive decoration. ' + (error.message || JSON.stringify(error)));
            return;
        }

        // Log deletion to history
        if (decoration) {
            await logDecorationHistory('deleted', decoration.id, decoration.name, {
                type: decoration.type,
                quantity: decoration.quantity_total
            });
        }

        await loadDecorations();
    } catch (err) {
        alert('Unexpected error archiving decoration.');
    }
}

searchDecorations?.addEventListener('input', () => applyDecorationFilters());
filterDecorationType?.addEventListener('change', () => applyDecorationFilters());

function applyDecorationFilters() {
    const q = (searchDecorations?.value || '').toLowerCase().trim();
    const type = filterDecorationType?.value || 'all';
    let filtered = decorationsData.slice();
    if (type !== 'all') filtered = filtered.filter(i => String(i.type) === String(type));
    if (q) filtered = filtered.filter(i => (i.name || '').toLowerCase().includes(q));
    renderDecorationsTable(filtered);
}

// ========== HISTORY LOGGING ==========
async function logInventoryHistory(action, itemId, itemName, details = {}) {
    try {
        const { error } = await supabase.from("inventory_history").insert({
            item_id: itemId,
            item_name: itemName,
            action: action,
            user_id: currentUser?.id || null,
            user_name: currentUser?.fullname || "Unknown",
            details: details
        });

        if (error) {
            console.error("Error logging history:", error);
        }
    } catch (err) {
        console.error("Failed to log history:", err);
    }
}

async function logDecorationHistory(action, itemId, itemName, details = {}) {
    try {
        const { error } = await supabase.from("decoration_history").insert({
            item_id: itemId,
            item_name: itemName,
            action: action,
            user_id: currentUser?.id || null,
            user_name: currentUser?.fullname || "Unknown",
            details: details
        });

        if (error) {
            console.error("Error logging decoration history:", error);
        }
    } catch (err) {
        console.error("Failed to log decoration history:", err);
    }
}

// ========== LOGOUT ==========
document.getElementById("logoutButton")?.addEventListener("click", logoutUser);
