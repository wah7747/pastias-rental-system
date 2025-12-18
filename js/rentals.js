// js/rentals.js
import { supabase } from "./supabase.js";
import { getCurrentUserProfile, isLoggedIn, canDelete } from "./auth.js";
import { ItemSearch } from "./item-search.js";

// DOM Elements
const addRentalBtn = document.getElementById("addRentalBtn");
const modal = document.getElementById("addRentalModal");
const modalOverlay = document.getElementById("addRentalOverlay");
const saveRentalBtn = document.getElementById("saveRentalBtn");
const cancelRentalBtn = document.getElementById("cancelRentalBtn");

const rentalClientName = document.getElementById("rentalClientName");
const rentalItem = document.getElementById("rentalItem");
const rentalQty = document.getElementById("rentalQty");
const rentalDate = document.getElementById("rentalDate");
const returnDate = document.getElementById("returnDate");
const paymentAmount = document.getElementById("paymentAmount");
const paymentMethod = document.getElementById("paymentMethod");
const paymentStatus = document.getElementById("paymentStatus");
const rentalStatus = document.getElementById("rentalStatus");
const availabilityInfo = document.getElementById("availabilityInfo");
const priceCalculation = document.getElementById("priceCalculation");
const customPriceCheckbox = document.getElementById("customPriceCheckbox");

// Cart Elements
const addToCartBtn = document.getElementById("addToCartBtn");
const addToCartSection = document.getElementById("addToCartSection");
const cartSection = document.getElementById("cartSection");
const cartItemsBody = document.getElementById("cartItemsBody");
const cartTotal = document.getElementById("cartTotal");

const tbody = document.getElementById("rentalsTableBody");
const emptyHint = document.getElementById("rentalsEmptyHint");

// Transaction Type Selector
const transactionTypeRental = document.getElementById("transactionTypeRental");
const transactionTypeSale = document.getElementById("transactionTypeSale");
let currentTransactionType = "rental"; // Default to rental


let allItems = [];
let editRentalId = null;
let showArchived = false;
let cartItems = []; // Array to store items before creating rentals
let currentUser = null; // Store current user profile for role checking
let itemSearch = null; // Searchable dropdown instance

// ---------- HELPER FUNCTIONS ----------

/**
 * Calculate the number of rental days between two dates
 * Uses inclusive counting: Jan 1 to Jan 3 = 3 days
 * Minimum 1 day for same-day rentals
 */
function calculateRentalDays(startDate, endDate) {
  if (!startDate || !endDate) return 1; // Default to 1 day if dates not set

  const start = new Date(startDate);
  const end = new Date(endDate);

  // Calculate difference in days (inclusive)
  const diffTime = end - start;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive counting

  // Minimum 1 day
  return Math.max(1, diffDays);
}

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", async () => {
  const logged = await isLoggedIn();
  if (!logged) {
    window.location.href = "index.html";
    return;
  }

  const profile = await getCurrentUserProfile();
  if (profile) {
    currentUser = profile; // Store for later use
    document.getElementById("welcomeUser").innerText = `Welcome, ${profile.fullname} `;
  }

  await loadItems();
  await loadRentals();

  // Initialize searchable dropdown
  itemSearch = new ItemSearch();

  // Check if we should auto-open the Add Rental modal (from Quick Actions)
  if (sessionStorage.getItem("openAddRentalModal")) {
    sessionStorage.removeItem("openAddRentalModal");
    setTimeout(() => {
      if (modal) {
        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");
        // Reset form
        document.getElementById("addRentalForm").reset();
        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        if (rentalDate) rentalDate.value = today;
        if (returnDate) returnDate.value = today;
        editRentalId = null;
      }
    }, 100);
  }
});

// ---------- MODAL HANDLERS ----------
addRentalBtn?.addEventListener("click", () => {
  openModal();
});

cancelRentalBtn?.addEventListener("click", closeModal);
modalOverlay?.addEventListener("click", closeModal);

// Transaction Type Switching
function switchTransactionType(type) {
  currentTransactionType = type;

  // Update button styles
  if (type === "rental") {
    transactionTypeRental?.classList.add("active");
    transactionTypeSale?.classList.remove("active");
    transactionTypeRental.style.background = "linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%)";
    transactionTypeRental.style.color = "white";
    transactionTypeRental.style.borderColor = "var(--color-primary-500)";

    transactionTypeSale.style.background = "white";
    transactionTypeSale.style.color = "var(--color-gray-700)";
    transactionTypeSale.style.borderColor = "var(--color-gray-300)";

    // Show return date field
    if (returnDate && returnDate.parentElement) {
      returnDate.parentElement.style.display = "block";
    }

    // Show rental status field
    if (rentalStatus && rentalStatus.parentElement) {
      rentalStatus.parentElement.style.display = "block";
    }

    // Update labels and button
    document.getElementById("modalTitle").textContent = editRentalId ? "Edit Rental" : "New Rental";
    document.querySelector('label[for="rentalDate"]').textContent = "Rental Date *";
    availabilityInfo.textContent = "Select item and dates to check availability";
    saveRentalBtn.textContent = "Save Rental";

    // Filter items to show only rental items (integer IDs)
    populateItemDropdown("rental");

    // Update search dropdown to show only rental items
    if (itemSearch) {
      const rentalItems = allItems.filter(item => item._itemType === 'rental');
      itemSearch.setItems(rentalItems);
    }

  } else {
    // Sale mode
    transactionTypeSale?.classList.add("active");
    transactionTypeRental?.classList.remove("active");
    transactionTypeSale.style.background = "linear-gradient(135deg, var(--color-accent-500) 0%, var(--color-accent-600) 100%)";
    transactionTypeSale.style.color = "white";
    transactionTypeSale.style.borderColor = "var(--color-accent-500)";

    transactionTypeRental.style.background = "white";
    transactionTypeRental.style.color = "var(--color-gray-700)";
    transactionTypeRental.style.borderColor = "var(--color-gray-300)";

    // Hide return date field
    if (returnDate && returnDate.parentElement) {
      returnDate.parentElement.style.display = "none";
      returnDate.value = ""; // Clear return date
    }

    // Hide rental status field
    if (rentalStatus && rentalStatus.parentElement) {
      rentalStatus.parentElement.style.display = "none";
    }

    // Update labels and button
    document.getElementById("modalTitle").textContent = editRentalId ? "Edit Sale" : "New Sale";
    document.querySelector('label[for="rentalDate"]').textContent = "Sale Date *";
    availabilityInfo.textContent = "Select item and quantity";
    saveRentalBtn.textContent = "Save Sale";


    // Filter items to show only decorations (UUID IDs)
    populateItemDropdown("sale");

    // Update search dropdown to show only sale items
    if (itemSearch) {
      const saleItems = allItems.filter(item => item._itemType === 'decoration');
      itemSearch.setItems(saleItems);
    }
  }
}

// Function to populate item dropdown based on transaction type
function populateItemDropdown(type) {
  let filteredItems;

  if (type === "rental") {
    // Show only rental items
    filteredItems = allItems.filter(item => item._itemType === 'rental');
  } else {
    // Show only decorations
    filteredItems = allItems.filter(item => item._itemType === 'decoration');
  }

  console.log(`Filtering for ${type}: `, filteredItems.length, "items found");

  if (filteredItems.length === 0) {
    rentalItem.innerHTML = `<option value="">No ${type === "rental" ? "rental items" : "decorations"} available</option>`;
    console.log("No items, set innerHTML to:", rentalItem.innerHTML);
    return;
  }

  const optionsHTML = '<option value="">-- Select Item --</option>' +
    filteredItems.map(item => {
      const available = item.realTimeAvailable || item.quantity_available || 0;
      return `<option value="${item.id}">${item.name} (${available} available)</option>`;
    }).join("");

  console.log("Setting dropdown HTML, element:", rentalItem);
  console.log("Options to set:", optionsHTML.substring(0, 200) + "...");

  rentalItem.innerHTML = optionsHTML;

  console.log("Dropdown innerHTML after setting:", rentalItem.innerHTML.substring(0, 200) + "...");
}

// Transaction type button click handlers
transactionTypeRental?.addEventListener("click", () => switchTransactionType("rental"));
transactionTypeSale?.addEventListener("click", () => switchTransactionType("sale"));

function openModal(rental = null) {
  modal.classList.remove("hidden");
  // modalOverlay is inside modal, so it becomes visible when modal does
  modal.setAttribute("aria-hidden", "false");

  // Hide batch items list (used for grouped rentals)
  const batchItemsList = document.getElementById("batchItemsList");
  if (batchItemsList) {
    batchItemsList.style.display = "none";
  }

  // Re-enable and show item/quantity fields
  rentalItem.disabled = false;
  rentalQty.disabled = false;
  if (rentalItem.parentElement && rentalItem.parentElement.parentElement) {
    rentalItem.parentElement.parentElement.style.display = "";
  }

  // Get phone and address fields
  const clientPhone = document.getElementById("rentalClientPhone");
  const clientAddress = document.getElementById("rentalClientAddress");

  if (rental) {
    // EDIT MODE - editing existing rental WITH CART
    editRentalId = rental.id;

    // Detect transaction type based on item_id
    const isDecorationItem = isDecoration(rental.item_id);
    const detectedType = isDecorationItem ? "sale" : "rental";

    // Switch to appropriate transaction type FIRST
    switchTransactionType(detectedType);

    // Now populate fields
    rentalClientName.value = rental.renter_name || "";
    if (clientPhone) clientPhone.value = rental.client_phone || "";
    if (clientAddress) clientAddress.value = rental.client_address || "";

    // Set dates first (needed for cart calculation)
    rentalDate.value = rental.rent_date || "";
    returnDate.value = rental.return_date || "";

    paymentMethod.value = rental.payment_method || "Cash";
    paymentStatus.value = rental.payment_status || "Pending";
    rentalStatus.value = rental.status || "active";

    // Reset item selector to empty (will add via cart)
    rentalItem.value = "";
    rentalQty.value = 1;

    // Show cart UI in edit mode
    addToCartSection.style.display = "block";

    // Pre-populate cart with existing rental item
    const item = allItems.find(i => String(i.id) === String(rental.item_id));
    if (item) {
      const days = calculateRentalDays(rental.rent_date, rental.return_date);
      const price = parseFloat(item.rental_price) || 0;

      // For decorations (sales), don't use days in calculation
      const subtotal = isDecorationItem ? (price * (rental.quantity || 1)) : (price * (rental.quantity || 1) * days);

      cartItems = [{
        itemId: String(rental.item_id),
        itemName: item.name,
        quantity: rental.quantity || 1,
        pricePerUnit: price,
        days: isDecorationItem ? null : days,
        subtotal: subtotal,
        isDecoration: isDecorationItem,
        existingRentalId: rental.id // Track original rental
      }];
    } else {
      cartItems = [];
    }

    renderCartItems();
    calculateCartTotal();

    customPriceCheckbox.checked = false;
    paymentAmount.setAttribute("readonly", true);
  } else {
    // NEW RENTAL MODE - using cart
    editRentalId = null;

    // Initialize transaction type to rental (default)
    switchTransactionType("rental");

    // Defaults
    rentalClientName.value = "";
    if (clientPhone) clientPhone.value = "";
    if (clientAddress) clientAddress.value = "";
    rentalItem.value = "";
    rentalQty.value = 1;
    rentalDate.value = new Date().toISOString().split('T')[0];
    // Default return date = tomorrow
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    returnDate.value = tmr.toISOString().split('T')[0];

    paymentAmount.value = 0;
    paymentMethod.value = "Cash";
    paymentStatus.value = "Pending";
    rentalStatus.value = "active";
    customPriceCheckbox.checked = false;
    paymentAmount.setAttribute("readonly", true);

    // Show cart UI and reset cart
    addToCartSection.style.display = "block";
    cartItems = [];
    renderCartItems();
    calculateCartTotal();
  }
  checkAvailability();
  calculatePayment();
}

function closeModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");

  // Clear search field
  if (itemSearch) {
    itemSearch.clear();
  }
}

// ---------- CART FUNCTIONS ----------

// Helper function to check if an item is a decoration (has UUID ID)
function isDecoration(itemId) {
  // Decorations have UUID IDs, inventory items have integer IDs
  const parsedId = parseInt(itemId);
  return isNaN(parsedId);
}

function addItemToCart() {
  const itemId = rentalItem.value;
  const qty = parseInt(rentalQty.value) || 0;
  const days = calculateRentalDays(rentalDate.value, returnDate.value);

  if (!itemId || qty <= 0) {
    alert("Please select an item and enter a valid quantity");
    return;
  }

  // Handle both integer IDs and UUID IDs
  let finalItemId;
  const parsedItemId = parseInt(itemId);

  if (isNaN(parsedItemId)) {
    // It's a UUID or non-numeric ID, use the original string
    finalItemId = itemId;
    console.log("Using UUID itemId:", finalItemId);
  } else {
    // It's a numeric ID
    finalItemId = parsedItemId;
    console.log("Using integer itemId:", finalItemId);
  }

  const item = allItems.find(i => String(i.id) === String(itemId));
  if (!item) {
    alert("Item not found");
    console.error("Item not found for ID:", itemId, "Available items:", allItems.map(i => ({ id: i.id, name: i.name })));
    return;
  }

  console.log("Found item:", item.name, "ID:", item.id);

  // Check if this is a decoration (sale) or rental item
  const isDecoItem = isDecoration(itemId);
  const price = parseFloat(item.rental_price) || 0;

  // For decorations (sales), don't multiply by days
  const subtotal = isDecoItem ? (price * qty) : (price * qty * days);

  // Check if item already in cart (compare as strings to handle both types)
  const existingIndex = cartItems.findIndex(ci => String(ci.itemId) === String(finalItemId));
  if (existingIndex >= 0) {
    // Update quantity instead of adding duplicate
    cartItems[existingIndex].quantity += qty;
    if (!isDecoItem) {
      cartItems[existingIndex].days = days; // Update days only for rentals
    }
    cartItems[existingIndex].subtotal = isDecoItem ?
      (cartItems[existingIndex].pricePerUnit * cartItems[existingIndex].quantity) :
      (cartItems[existingIndex].pricePerUnit * cartItems[existingIndex].quantity * days);
  } else {
    // Add new item to cart
    cartItems.push({
      itemId: finalItemId, // Can be either integer or UUID
      itemName: item.name,
      quantity: qty,
      pricePerUnit: price,
      days: isDecoItem ? null : days, // No days for decorations (sales)
      subtotal: subtotal,
      isDecoration: isDecoItem // Flag to track if this is a sale
    });
  }

  // Reset item selector
  rentalItem.value = "";
  rentalQty.value = 1;

  // Update cart display
  renderCartItems();
  calculateCartTotal();

  // Show success feedback
  availabilityInfo.textContent = `✓ ${item.name} added to cart!`;
  availabilityInfo.style.color = "green";
}

function removeItemFromCart(index) {
  if (confirm("Remove this item from cart?")) {
    cartItems.splice(index, 1);
    renderCartItems();
    calculateCartTotal();
  }
}

function renderCartItems() {
  if (cartItems.length === 0) {
    cartSection.style.display = "none";
    cartItemsBody.innerHTML = "";
    return;
  }

  cartSection.style.display = "block";

  cartItemsBody.innerHTML = cartItems.map((item, index) => `
    <tr>
      <td>${item.itemName} ${item.isDecoration ? '<span style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; margin-left: 8px;">SALE</span>' : ''}</td>
      <td>${item.quantity}</td>
      <td>${item.isDecoration ? ('P' + item.pricePerUnit.toFixed(2) + ' x ' + item.quantity + ' ' + (item.quantity > 1 ? 'pieces' : 'piece')) : ('P' + item.pricePerUnit.toFixed(2) + ' x ' + item.quantity + ' ' + (item.quantity > 1 ? 'pieces' : 'piece') + ' x ' + item.days + ' ' + (item.days > 1 ? 'days' : 'day'))}</td>
      <td>₱${item.subtotal.toFixed(2)}</td>
      <td><button onclick="removeItemFromCart(${index})" style="padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">Remove</button></td>
    </tr>
  `).join("");
}

function calculateCartTotal() {
  const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  cartTotal.textContent = `₱${total.toFixed(2)} `;
  paymentAmount.value = total.toFixed(2);
}

// Expose removeItemFromCart globally for onclick handlers
window.removeItemFromCart = removeItemFromCart;

// Add to Cart button handler
addToCartBtn?.addEventListener("click", addItemToCart);

// ---------- LOGIC ----------

async function loadItems() {
  console.log("=== loadItems called ===");

  // Fetch both inventory items and decorations
  const { data: inventoryItems, error: itemsError } = await supabase
    .from("inventory_items")
    .select("id, name, quantity_total, quantity_available, rental_price")
    .eq("archived", false)
    .order("name");

  const { data: decorations, error: decorError } = await supabase
    .from("decorations")
    .select("id, name, quantity_total, quantity_available, rental_price")
    .eq("archived", false)
    .order("name");

  console.log("Inventory items fetched:", inventoryItems?.length || 0);
  console.log("Decorations fetched:", decorations?.length || 0);

  if (itemsError) {
    console.error("Error loading inventory items:", itemsError);
  }
  if (decorError) {
    console.error("Error loading decorations:", decorError);
  }

  // Merge both arrays and add source flag
  const allItemsData = [
    ...(inventoryItems || []).map(item => ({ ...item, _itemType: 'rental' })),
    ...(decorations || []).map(item => ({ ...item, _itemType: 'decoration' }))
  ];

  console.log("Total items combined:", allItemsData.length);

  if (allItemsData.length === 0) {
    rentalItem.innerHTML = '<option value="">No items available</option>';
    allItems = [];
    return;
  }

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

  // Add real-time availability to items
  allItems = allItemsData.map(item => ({
    ...item,
    realTimeAvailable: item.quantity_total - (rentedMap[item.id] || 0)
  }));

  console.log("allItems set with", allItems.length, "items");
  console.log("Calling populateItemDropdown('rental')");

  // Initially populate with rental items (default mode)
  populateItemDropdown("rental");

  // Update searchable dropdown with all items
  if (itemSearch) {
    itemSearch.setItems(allItems);
  }
}

// Recalculate cart items when dates change
function recalculateCartDays() {
  // Validation: Check if cart is empty
  if (cartItems.length === 0) return;

  // Validation: Check if dates are selected
  if (!rentalDate?.value || !returnDate?.value) {
    console.warn("Cannot recalculate cart: rental or return date is missing");
    return;
  }

  // Validation: Check if return date is not before rental date
  if (returnDate.value < rentalDate.value) {
    console.warn("Cannot recalculate cart: return date is before rental date");
    availabilityInfo.textContent = "⚠️ Return date cannot be before rental date";
    availabilityInfo.style.color = "orange";
    return;
  }


  try {
    const days = calculateRentalDays(rentalDate.value, returnDate.value);

    // Update all cart items with new days
    cartItems = cartItems.map(item => ({
      ...item,
      days: days,
      subtotal: item.pricePerUnit * item.quantity * days
    }));

    renderCartItems();
    calculateCartTotal();

    // Clear any previous warnings
    if (availabilityInfo) {
      availabilityInfo.style.color = "";
    }
  } catch (error) {
    console.error("Error recalculating cart days:", error);
    alert("Error updating cart with new dates. Please try again.");
  }
}

// Auto-check availability and calculate price when fields change
[rentalItem, rentalQty, rentalDate, returnDate].forEach(el => {
  el?.addEventListener("change", () => {
    checkAvailability();
    calculatePayment();
    // Recalculate cart if dates changed
    if (el === rentalDate || el === returnDate) {
      recalculateCartDays();
      // Also recalculate batch payment if in batch edit mode
      if (editRentalId && typeof editRentalId === 'string' && editRentalId.startsWith("BATCH:")) {
        recalculateBatchPayment();
      }
    }
  });
});

// Handle custom price checkbox
customPriceCheckbox?.addEventListener("change", () => {
  if (customPriceCheckbox.checked) {
    paymentAmount.removeAttribute("readonly");
    paymentAmount.focus();
    priceCalculation.textContent = "Manual price entry enabled";
    priceCalculation.style.color = "#ff9800";
  } else {
    paymentAmount.setAttribute("readonly", true);
    calculatePayment();
  }
});

// Handle History Toggle
const viewHistoryToggle = document.getElementById("viewHistoryToggle");
const historyLabel = document.getElementById("historyLabel");

viewHistoryToggle?.addEventListener("change", () => {
  showArchived = viewHistoryToggle.checked;
  historyLabel.textContent = showArchived ? "Viewing Archived History" : "View Archived History";
  historyLabel.style.fontWeight = showArchived ? "bold" : "normal";
  historyLabel.style.color = showArchived ? "#2196F3" : "inherit";
  loadRentals();
});

// Expose archive function globally so it can be called from HTML onclick
window.archiveRental = async (id) => {
  if (!confirm("Are you sure you wish to put this in the archive? This will move it to history.")) return;

  const { error } = await supabase
    .from("rentals")
    .update({ archived: true })
    .eq("id", id);

  if (error) {
    alert("Error archiving rental: " + error.message);
  } else {
    loadRentals();
  }
};

// Expose delete function globally
window.deleteRental = async (id) => {
  // Check permission
  if (!await canDelete()) {
    alert("Permission denied. Only Admins can delete rentals.");
    return;
  }

  if (!confirm("Are you sure you want to DELETE this rental permanently? This cannot be undone.")) return;

  try {
    const { error, count } = await supabase
      .from("rentals")
      .delete({ count: 'exact' })
      .eq("id", id);

    if (error) {
      // Check for foreign key constraint error (linked reports)
      if (error.code === '23503') {
        alert("Cannot delete this rental because it has linked Reports (Incident Reports). Please delete the reports first.");
      } else {
        alert("Error deleting rental: " + (error.message || JSON.stringify(error)));
      }
      console.error("Delete error:", error);
    } else if (count === 0) {
      alert("Item could not be deleted. It may have already been deleted or you do not have permission.");
      loadRentals(); // Refresh to sync UI
    } else {
      alert("Rental deleted successfully.");
      loadRentals();
      refreshCalendar(); // Refresh calendar view
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    alert("An unexpected error occurred.");
  }
};

// Expose archive group function for grouped rentals
window.archiveRentalGroup = async (idsString) => {
  // Check permission
  if (!await canDelete()) {
    alert("Permission denied. Only Admins can delete rentals.");
    return;
  }

  const ids = idsString.split(',');
  const count = ids.length;

  if (!confirm(`Are you sure you wish to put ${count === 1 ? 'this rental' : count + ' rentals'} in the archive ? This will move ${count === 1 ? 'it' : 'them'} to history.`)) return;

  let successCount = 0;
  for (const id of ids) {
    const { error } = await supabase
      .from("rentals")
      .update({ archived: true })
      .eq("id", id);

    if (!error) successCount++;
  }

  if (successCount > 0) {
    loadRentals();
    if (successCount < count) {
      alert(`Archived ${successCount} out of ${count} rental(s)`);
    }
  } else {
    alert("Error archiving rentals");
  }
};

// Expose delete group function for grouped rentals
window.deleteRentalGroup = async (idsString) => {
  // Check permission
  if (!await canDelete()) {
    alert("Permission denied. Only Admins can delete rentals.");
    return;
  }

  const ids = idsString.split(',');
  const count = ids.length;

  if (!confirm(`Are you sure you want to DELETE ${count} rental(s) permanently ? This cannot be undone.`)) return;

  try {
    let successCount = 0;
    for (const id of ids) {
      const { error, count: delCount } = await supabase
        .from("rentals")
        .delete({ count: 'exact' })
        .eq("id", id);

      if (!error && delCount > 0) {
        successCount++;
      } else if (error && error.code === '23503') {
        alert(`Cannot delete rental ${id} because it has linked Reports.Please delete the reports first.`);
      }
    }

    if (successCount > 0) {
      alert(`Successfully deleted ${successCount} out of ${count} rental(s).`);
      loadRentals();
    } else {
      alert("Could not delete rentals. They may have linked reports.");
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    alert("An unexpected error occurred.");
  }
};

// Expose view details function globally
window.viewRentalDetails = async (id) => {
  const { data, error } = await supabase
    .from("rentals")
    .select(`
id, item_id, renter_name, quantity, rent_date, return_date,
  payment_amount, payment_method, payment_status, status, archived, created_at
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    alert("Error loading rental details");
    return;
  }

  // Fetch item name from inventory_items or decorations
  let itemName = "Unknown Item";

  // Try inventory_items first
  const { data: invItem } = await supabase
    .from("inventory_items")
    .select("name")
    .eq("id", data.item_id)
    .single();

  if (invItem) {
    itemName = invItem.name;
  } else {
    // Try decorations if not found in inventory_items
    const { data: decItem } = await supabase
      .from("decorations")
      .select("name")
      .eq("id", data.item_id)
      .single();

    if (decItem) {
      itemName = decItem.name;
    }
  }

  // Create and show detail modal
  const statusColor = getStatusColor(data.status);

  const detailHTML = `
  <div id="rentalDetailModal" class="modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 1000;">
      <div class="modal-overlay" onclick="closeDetailModal()"></div>
      <div class="modal-card" style="max-width: 600px; position: relative; z-index: 1001;">
        <div class="modal-header">
          <h2>Rental Details</h2>
          <button onclick="closeDetailModal()" class="close-modal-btn" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
        </div>
        
        <div class="modal-body">
          <div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 8px 0; color: #333; font-size: 1.2rem;">${itemName}</h3>
            <div style="display: inline-block; padding: 4px 12px; border-radius: 4px; background: ${statusColor}; color: white; font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">
              ${getStatusLabel(data.status)}
            </div>
          </div>

          <h3 style="margin-bottom: 16px; color: #333; font-size: 1rem; border-bottom: 2px solid #eee; padding-bottom: 8px;">Rental Information</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
            <div>
              <strong style="color: #666; font-size: 0.9rem;">Client</strong>
              <p style="margin: 4px 0 0 0;">${data.renter_name || 'N/A'}</p>
            </div>
            <div>
              <strong style="color: #666; font-size: 0.9rem;">Quantity</strong>
              <p style="margin: 4px 0 0 0;">${data.quantity} piece${data.quantity > 1 ? 's' : ''}</p>
            </div>
            <div>
              <strong style="color: #666; font-size: 0.9rem;">Rental Date</strong>
              <p style="margin: 4px 0 0 0;">${data.rent_date}</p>
            </div>
            <div>
              <strong style="color: #666; font-size: 0.9rem;">Return Date</strong>
              <p style="margin: 4px 0 0 0;">${data.return_date || '-'}</p>
            </div>
          </div>

          <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">

          <h3 style="margin-bottom: 16px; color: #333; font-size: 1rem; border-bottom: 2px solid #eee; padding-bottom: 8px;">Payment Information</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <strong style="color: #666; font-size: 0.9rem;">Amount</strong>
              <p style="margin: 4px 0 0 0; font-size: 1.2rem; color: #4caf50; font-weight: 600;">₱${parseFloat(data.payment_amount).toFixed(2)}</p>
            </div>
            <div>
              <strong style="color: #666; font-size: 0.9rem;">Payment Method</strong>
              <p style="margin: 4px 0 0 0;">${data.payment_method}</p>
            </div>
            <div>
              <strong style="color: #666; font-size: 0.9rem;">Payment Status</strong>
              <p style="margin: 4px 0 0 0;">${data.payment_status}</p>
            </div>
            <div>
              <strong style="color: #666; font-size: 0.9rem;">Created</strong>
              <p style="margin: 4px 0 0 0; font-size: 0.9rem;">${new Date(data.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="margin-top: 24px; display: flex; gap: 8px; justify-content: flex-end;">
          <button onclick="closeDetailModal(); editRental('${data.id}');" class="primary-button" style="padding: 10px 20px;">Edit Rental</button>
          <button onclick="closeDetailModal()" class="btn-cancel" style="padding: 10px 20px;">Close</button>
        </div>
      </div>
    </div>
  `;

  // Remove existing detail modal if any
  const existing = document.getElementById('rentalDetailModal');
  if (existing) existing.remove();

  // Add to body
  document.body.insertAdjacentHTML('beforeend', detailHTML);
};

// Close detail modal
window.closeDetailModal = () => {
  const modal = document.getElementById('rentalDetailModal');
  if (modal) modal.remove();
};

// Calculate payment based on item price and quantity
function calculatePayment() {
  // Skip if custom price is enabled
  if (customPriceCheckbox?.checked) return;

  const itemId = rentalItem.value;
  const qty = parseInt(rentalQty.value) || 0;
  const days = calculateRentalDays(rentalDate.value, returnDate.value);

  if (!itemId || qty === 0) {
    paymentAmount.value = 0;
    priceCalculation.textContent = "Select item and quantity";
    priceCalculation.style.color = "#666";
    return;
  }

  const item = allItems.find(i => String(i.id) === String(itemId));
  if (!item) return;

  const price = parseFloat(item.rental_price) || 0;

  // Check if this is a decoration (sale) - don't multiply by days for sales
  const isDecorationSale = isDecoration(itemId) && currentTransactionType === "sale";
  const total = isDecorationSale ? (price * qty) : (price * qty * days);

  paymentAmount.value = total.toFixed(2);

  if (price === 0) {
    priceCalculation.textContent = "No price set for this item";
    priceCalculation.style.color = "#ff9800";
  } else {
    if (isDecorationSale) {
      // For sales, don't show days
      priceCalculation.textContent = `₱${price.toFixed(2)} × ${qty} piece${qty > 1 ? 's' : ''} = ₱${total.toFixed(2)} `;
    } else {
      // For rentals, include days
      priceCalculation.textContent = `₱${price.toFixed(2)} × ${qty} piece${qty > 1 ? 's' : ''} × ${days} day${days > 1 ? 's' : ''} = ₱${total.toFixed(2)} `;
    }
    priceCalculation.style.color = "#4caf50";
  }
}

async function checkAvailability() {
  const itemId = rentalItem.value;
  const start = rentalDate.value;
  const end = returnDate.value;
  const qty = parseInt(rentalQty.value) || 0;

  if (!itemId || !start || !end) {
    availabilityInfo.textContent = "Select item and dates to check availability";
    availabilityInfo.style.color = "#666";
    saveRentalBtn.disabled = false;
    return { available: true }; // Allow save if fields not filled yet
  }

  if (end < start) {
    availabilityInfo.textContent = "Return date cannot be before rental date";
    availabilityInfo.style.color = "red";
    saveRentalBtn.disabled = true;
    return { available: false, reason: "Invalid dates" };
  }

  // Simple check: Get item's base availability
  const item = allItems.find(i => String(i.id) === String(itemId));
  if (!item) {
    saveRentalBtn.disabled = false;
    return { available: true };
  }

  // Check overlapping rentals during the date range
  // Query the database for overlapping rentals and calculate availability

  let query = supabase
    .from("rentals")
    .select("quantity")
    .eq("item_id", itemId)
    // Count Active, Reserved, and Overdue as "taking up inventory"
    .in("status", ["active", "reserved", "overdue"])
    // Overlap logic: (StartA <= EndB) and (EndA >= StartB)
    .lte("rent_date", end)
    .gte("return_date", start);

  // If editing, exclude the current rental from the count
  if (editRentalId) {
    query = query.neq("id", editRentalId);
  }

  const { data: overlappingRentals, error } = await query;

  if (error) {
    console.error(error);
    saveRentalBtn.disabled = false;
    return { available: true };
  }

  // Sum up the quantities of all overlapping rentals for the selected date range
  const currentlyRented = overlappingRentals.reduce((sum, rental) => sum + (rental.quantity || 0), 0);
  // Calculate availability for the selected dates
  const availableForDates = item.quantity_total - currentlyRented;

  // Get current overall availability (already calculated in loadItems)
  const currentAvailable = item.realTimeAvailable || item.quantity_total;

  if (availableForDates < qty) {
    availabilityInfo.textContent = `ERROR: Only ${availableForDates} units available for selected dates!(Total: ${item.quantity_total}, Rented for these dates: ${currentlyRented})`;
    availabilityInfo.style.color = "red";
    availabilityInfo.style.fontWeight = "bold";
    saveRentalBtn.disabled = true;
    return { available: false, reason: `Only ${availableForDates} units available, but ${qty} requested`, availableQty: availableForDates };
  } else {
    // Show current overall availability if different from date-specific
    if (currentAvailable !== availableForDates) {
      availabilityInfo.textContent = `Available!(${availableForDates} units free for these dates, ${currentAvailable} currently available overall)`;
    } else {
      availabilityInfo.textContent = `Available!(${availableForDates} units free)`;
    }
    availabilityInfo.style.color = "green";
    availabilityInfo.style.fontWeight = "normal";
    saveRentalBtn.disabled = false;
    return { available: true, availableQty: availableForDates };
  }
}

saveRentalBtn?.addEventListener("click", async () => {
  const selectedStatus = rentalStatus.value;
  const sharedClientName = rentalClientName.value;
  const sharedClientPhone = document.getElementById("rentalClientPhone")?.value || null;
  const sharedClientAddress = document.getElementById("rentalClientAddress")?.value || null;
  const sharedRentalDate = rentalDate.value;
  const sharedReturnDate = returnDate.value;
  const sharedPaymentMethod = paymentMethod.value;
  const sharedPaymentStatus = paymentStatus.value;

  // Validate required common fields
  if (!sharedClientName || !sharedRentalDate) {
    alert("Please fill in client name and rental date");
    return;
  }

  // Validate custom price if enabled
  if (customPriceCheckbox?.checked) {
    const customPrice = parseFloat(paymentAmount.value) || 0;
    if (customPrice <= 0) {
      alert("Please enter a valid custom price greater than ₱0");
      return;
    }
  }

  // INTERCEPT: If status is being changed to "returned", show missing items confirmation
  if (selectedStatus === "returned" && editRentalId) {
    // Show missing items modal and stop normal save flow
    await showMissingItemsModal(editRentalId);
    return; // Don't proceed with normal save
  }

  saveRentalBtn.disabled = true;

  try {
    // BATCH EDIT MODE - updating/adding/removing items in grouped rentals
    if (editRentalId && typeof editRentalId === 'string' && editRentalId.startsWith("BATCH:")) {
      const originalIds = editRentalId.replace("BATCH:", "").split(',');
      if (batchEditRentals.length === 0) {
        alert("At least one item is required");
        saveRentalBtn.disabled = false;
        return;
      }
      try {
        const processedIds = [];
        let insertCount = 0;
        let updateCount = 0;
        for (const rental of batchEditRentals) {
          const payload = {
            renter_name: sharedClientName,
            client_phone: sharedClientPhone,
            client_address: sharedClientAddress,
            rent_date: sharedRentalDate,
            return_date: sharedReturnDate || null, // Use null if empty (for sales)
            payment_method: sharedPaymentMethod,
            payment_status: sharedPaymentStatus,
            status: selectedStatus,
            item_id: rental.item_id,
            quantity: rental.quantity,
            payment_amount: rental.itemPrice * rental.quantity
          };
          if (['active', 'reserved', 'overdue'].includes(selectedStatus)) {
            payload.archived = false;
          }
          const item = allItems.find(i => String(i.id) === String(rental.item_id));
          if (!item) continue;
          let availQuery = supabase
            .from("rentals")
            .select("quantity")
            .eq("item_id", rental.item_id)
            .in("status", ["active", "reserved", "overdue"])
            .lte("rent_date", sharedReturnDate)
            .gte("return_date", sharedRentalDate);
          if (rental.id) {
            availQuery = availQuery.neq("id", rental.id);
          }
          const { data: overlapping } = await availQuery;
          const currentlyRented = overlapping ? overlapping.reduce((sum, r) => sum + (r.quantity || 0), 0) : 0;
          const available = item.quantity_total - currentlyRented;
          if (available < rental.quantity) {
            alert(`Insufficient inventory for ${rental.itemName}.Only ${available} available, but ${rental.quantity} requested.`);
            saveRentalBtn.disabled = false;
            return;
          }
          if (rental.id) {
            const { error } = await supabase.from("rentals").update(payload).eq("id", rental.id);
            if (error) throw error;
            processedIds.push(rental.id);
            updateCount++;
          } else {
            const { data: newRental, error } = await supabase.from("rentals").insert(payload).select().single();
            if (error) throw error;
            processedIds.push(newRental.id);
            insertCount++;
          }
        }
        const idsToDelete = originalIds.filter(id => !processedIds.map(String).includes(String(id)));
        let deleteCount = 0;
        for (const id of idsToDelete) {
          const { error } = await supabase.from("rentals").delete().eq("id", id);
          if (!error) deleteCount++;
        }
        closeModal();
        loadRentals();
        let message = "Batch rental updated successfully!";
        if (insertCount > 0) message += `\n - ${insertCount} item(s) added`;
        if (deleteCount > 0) message += `\n - ${deleteCount} item(s) removed`;
        alert(message);
      } catch (err) {
        alert("Error updating batch rental: " + err.message);
        console.error(err);
        saveRentalBtn.disabled = false;
      }
      return;
    }

    // EDIT MODE - updating existing rental (now uses cart for multi-item support)
    if (editRentalId) {
      // Use cart-based editing (same as creating new rentals)
      if (cartItems.length === 0) {
        alert("Please add at least one item to the cart");
        saveRentalBtn.disabled = false;
        return;
      }

      try {
        // Check if this is a simple single-item edit (same item, just updating details)
        const isSingleItemEdit = cartItems.length === 1 &&
          cartItems[0].existingRentalId === editRentalId;

        if (isSingleItemEdit) {
          // SIMPLE UPDATE: Update the existing rental in place (preserves ID and foreign key relationships)
          const cartItem = cartItems[0];

          const rentalPayload = {
            renter_name: sharedClientName,
            client_phone: sharedClientPhone,
            client_address: sharedClientAddress,
            item_id: cartItem.itemId,
            quantity: cartItem.quantity,
            rent_date: sharedRentalDate,
            return_date: sharedReturnDate || null,
            payment_amount: cartItem.subtotal,
            payment_method: sharedPaymentMethod,
            payment_status: sharedPaymentStatus,
            status: selectedStatus
          };

          if (['active', 'reserved', 'overdue'].includes(selectedStatus)) {
            rentalPayload.archived = false;
          }

          // Validate availability (excluding current rental)
          const item = allItems.find(i => String(i.id) === String(cartItem.itemId));
          if (!item) {
            throw new Error("Item not found");
          }

          let availQuery = supabase
            .from("rentals")
            .select("quantity")
            .eq("item_id", cartItem.itemId)
            .in("status", ["active", "reserved", "overdue"])
            .lte("rent_date", sharedReturnDate)
            .gte("return_date", sharedRentalDate)
            .neq("id", editRentalId); // Exclude current rental

          const { data: overlapping } = await availQuery;
          const currentlyRented = overlapping ? overlapping.reduce((sum, r) => sum + (r.quantity || 0), 0) : 0;
          const available = item.quantity_total - currentlyRented;

          if (available < cartItem.quantity) {
            alert(`Insufficient inventory for ${cartItem.itemName}.Only ${available} available.`);
            saveRentalBtn.disabled = false;
            return;
          }

          // Update the rental in place
          const { error: updateError } = await supabase
            .from("rentals")
            .update(rentalPayload)
            .eq("id", editRentalId);

          if (updateError) throw updateError;

          closeModal();
          loadRentals();
          alert("Rental updated successfully!");

        } else {
          // COMPLEX EDIT: User is changing items (adding/removing from cart)
          // This requires delete-and-recreate, but we need to check for linked reports first

          // Check if this rental has linked reports
          const { data: linkedReports, error: reportsError } = await supabase
            .from("reports")
            .select("id")
            .eq("rental_id", editRentalId)
            .limit(1);

          if (reportsError) {
            console.error("Error checking for reports:", reportsError);
            // Continue anyway, the delete will fail if there are reports
          }

          if (linkedReports && linkedReports.length > 0) {
            // This rental has linked incident reports, cannot delete it
            alert("Cannot modify items for this rental because it has linked Incident Reports.\n\n" +
              "You can either:\n" +
              "• Edit the rental details without changing the item (cancel and reopen)\n" +
              "• Delete the incident reports first, then edit this rental\n\n" +
              "This protects data integrity and prevents orphaned reports.");
            saveRentalBtn.disabled = false;
            return;
          }

          // No reports linked, safe to delete and recreate
          const { error: deleteError } = await supabase
            .from("rentals")
            .delete()
            .eq("id", editRentalId);

          if (deleteError) {
            // Check if it's a foreign key constraint error
            if (deleteError.code === '23503') {
              alert("Cannot modify items: This rental has linked Incident Reports.\n\n" +
                "Please delete the reports first or edit without changing items.");
            } else {
              throw deleteError;
            }
            saveRentalBtn.disabled = false;
            return;
          }

          // Create new rentals from cart items
          const createdRentals = [];
          for (const cartItem of cartItems) {
            const rentalPayload = {
              renter_name: sharedClientName,
              client_phone: sharedClientPhone,
              client_address: sharedClientAddress,
              item_id: cartItem.itemId,
              quantity: cartItem.quantity,
              rent_date: sharedRentalDate,
              return_date: sharedReturnDate || null, // Use null if empty (for sales)
              payment_amount: cartItem.subtotal,
              payment_method: sharedPaymentMethod,
              payment_status: sharedPaymentStatus,
              status: selectedStatus
            };

            if (['active', 'reserved', 'overdue'].includes(selectedStatus)) {
              rentalPayload.archived = false;
            }

            // Validate availability
            const item = allItems.find(i => String(i.id) === String(cartItem.itemId));
            if (!item) continue;

            let availQuery = supabase
              .from("rentals")
              .select("quantity")
              .eq("item_id", cartItem.itemId)
              .in("status", ["active", "reserved", "overdue"])
              .lte("rent_date", sharedReturnDate)
              .gte("return_date", sharedRentalDate);

            const { data: overlapping } = await availQuery;
            const currentlyRented = overlapping ? overlapping.reduce((sum, r) => sum + (r.quantity || 0), 0) : 0;
            const available = item.quantity_total - currentlyRented;

            if (available < cartItem.quantity) {
              alert(`Insufficient inventory for ${cartItem.itemName}.Only ${available} available.`);
              saveRentalBtn.disabled = false;
              return;
            }

            const { data: newRental, error } = await supabase
              .from("rentals")
              .insert(rentalPayload)
              .select()
              .single();

            if (error) {
              console.error("Error creating rental for", cartItem.itemName, error);
              throw new Error(`Failed to create rental for ${cartItem.itemName}: ${error.message} `);
            }

            // If this is a decoration (sale), decrease the available quantity
            if (cartItem.isDecoration) {
              const { error: invError } = await supabase
                .from("decorations")
                .update({ quantity_available: item.quantity_available - cartItem.quantity })
                .eq("id", cartItem.itemId);

              if (invError) {
                console.error("Error updating decoration inventory:", invError);
              }
            }

            createdRentals.push(newRental);
          }

          closeModal();
          loadRentals();
          refreshCalendar(); // Refresh calendar view
          alert(`Rental updated successfully! ${createdRentals.length} item(s) in transaction.`);
        }
      } catch (err) {
        alert("Error updating rental: " + err.message);
        console.error(err);
        saveRentalBtn.disabled = false;
      }
      return;
    }

    // NEW RENTAL MODE - create multiple rentals from cart
    else {
      if (cartItems.length === 0) {
        alert("Please add at least one item to the cart");
        saveRentalBtn.disabled = false;
        return;
      }

      // Validate availability for all cart items
      let allAvailable = true;
      const unavailableItems = [];

      for (const cartItem of cartItems) {
        const item = allItems.find(i => String(i.id) === String(cartItem.itemId));
        if (!item) continue;

        let query = supabase
          .from("rentals")
          .select("quantity")
          .eq("item_id", cartItem.itemId)
          .in("status", ["active", "reserved", "overdue"])
          .lte("rent_date", sharedReturnDate)
          .gte("return_date", sharedRentalDate);

        const { data: overlappingRentals } = await query;
        const currentlyRented = overlappingRentals ? overlappingRentals.reduce((sum, r) => sum + (r.quantity || 0), 0) : 0;
        const availableForDates = item.quantity_total - currentlyRented;

        if (availableForDates < cartItem.quantity) {
          allAvailable = false;
          unavailableItems.push(`${cartItem.itemName} (need ${cartItem.quantity}, only ${availableForDates} available)`);
        }
      }

      if (!allAvailable) {
        alert(`Cannot create rental - insufficient inventory for: \n\n${unavailableItems.join('\n')} `);
        saveRentalBtn.disabled = false;
        return;
      }

      // Create a rental record for each cart item
      const createdRentals = [];
      for (const cartItem of cartItems) {
        const rentalPayload = {
          renter_name: sharedClientName,
          client_phone: sharedClientPhone,
          client_address: sharedClientAddress,
          item_id: cartItem.itemId,
          quantity: cartItem.quantity,
          rent_date: sharedRentalDate,
          return_date: sharedReturnDate || null, // Use null if empty (for sales)
          payment_amount: cartItem.subtotal,
          payment_method: sharedPaymentMethod,
          payment_status: sharedPaymentStatus,
          status: selectedStatus
        };

        if (['active', 'reserved', 'overdue'].includes(selectedStatus)) {
          rentalPayload.archived = false;
        }

        const { data: newRental, error } = await supabase
          .from("rentals")
          .insert(rentalPayload)
          .select()
          .single();

        if (error) {
          console.error("Error creating rental for", cartItem.itemName, error);
          throw new Error(`Failed to create rental for ${cartItem.itemName}: ${error.message} `);
        }

        // If this is a decoration (sale), decrease the available quantity
        if (cartItem.isDecoration) {
          const item = allItems.find(i => String(i.id) === String(cartItem.itemId));
          if (item) {
            const { error: invError } = await supabase
              .from("decorations")
              .update({ quantity_available: item.quantity_available - cartItem.quantity })
              .eq("id", cartItem.itemId);

            if (invError) {
              console.error("Error updating decoration inventory:", invError);
            }
          }
        }

        createdRentals.push(newRental);
      }

      closeModal();
      loadRentals();
      refreshCalendar(); // Refresh calendar view
      alert(`Successfully created ${createdRentals.length} rental(s) for ${sharedClientName}!`);
    }
  } catch (err) {
    alert("Error saving rental: " + err.message);
    console.error(err);
  } finally {
    saveRentalBtn.disabled = false;
  }
});

async function loadRentals() {
  tbody.innerHTML = "<tr><td colspan='8'>Loading...</td></tr>";

  let query = supabase
    .from("rentals")
    .select("id, item_id, renter_name, client_phone, client_address, quantity, rent_date, return_date, payment_amount, payment_status, status, archived")
    .order("rent_date", { ascending: false });

  // Filter based on toggle
  if (showArchived) {
    query = query.eq("archived", true);
  } else {
    // Default view: Show only unarchived (active) rentals
    // Handle legacy data where archived might be null
    query = query.or('archived.is.null,archived.eq.false');
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error loading rentals:", error);
    tbody.innerHTML = "<tr><td colspan='8'>Error loading data</td></tr>";
    return;
  }

  // Hide/Show empty hint based on data
  if (!data || data.length === 0) {
    emptyHint.style.display = "block";
    emptyHint.textContent = showArchived ? "No archived rentals found." : "No active rentals found.";
    tbody.innerHTML = "";
    return;
  }
  emptyHint.style.display = "none";

  // Fetch all inventory items and decorations to get names
  const { data: inventoryItems, error: invError } = await supabase.from("inventory_items").select("id, name").eq("archived", false);
  const { data: decorations, error: decoError } = await supabase.from("decorations").select("id, name").eq("archived", false);

  // Create a map of item IDs to names (convert all keys to strings for consistent lookup)
  const itemNameMap = {};
  (inventoryItems || []).forEach(item => itemNameMap[String(item.id)] = item.name);
  (decorations || []).forEach(item => itemNameMap[String(item.id)] = item.name);

  console.log("Item name map:", itemNameMap);

  // Group rentals by client name + rental date + return date + status
  const groupedRentals = {};

  data.forEach(r => {
    const groupKey = `${r.renter_name}| ${r.rent_date}| ${r.return_date}| ${r.status}| ${r.payment_status}| ${r.payment_method} `;

    if (!groupedRentals[groupKey]) {
      groupedRentals[groupKey] = {
        renter_name: r.renter_name,
        client_phone: r.client_phone,
        client_address: r.client_address,
        rent_date: r.rent_date,
        return_date: r.return_date,
        status: r.status,
        payment_status: r.payment_status,
        payment_method: r.payment_method,
        archived: r.archived,
        items: [],
        rentalIds: []
      };
    }

    groupedRentals[groupKey].items.push({
      name: itemNameMap[String(r.item_id)] || "Unknown Item",
      quantity: r.quantity,
      payment: r.payment_amount
    });
    groupedRentals[groupKey].rentalIds.push(r.id);
  });

  // Convert grouped object to array and sort by rental date (descending)
  const groupedArray = Object.values(groupedRentals).sort((a, b) => {
    return new Date(b.rent_date) - new Date(a.rent_date);
  });

  tbody.innerHTML = groupedArray.map(group => {
    // Display items horizontally: "Chair (5), Table (3), Tent (2)"
    const itemsDisplay = group.items.map(item =>
      `${item.name} (${item.quantity})`
    ).join(', ');

    // Sum up total quantity and payment
    const totalQuantity = group.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalPayment = group.items.reduce((sum, item) => sum + parseFloat(item.payment || 0), 0);

    const statusClass = getStatusClass(group.status);

    // Determine if archive button should be shown
    const canArchive = !group.archived && (group.status === 'returned' || group.status === 'cancelled' || group.payment_status === 'Paid');

    // For grouped rentals with multiple items, pass ALL rental IDs for batch edit
    const isMultiItem = group.items.length > 1;
    const editIds = isMultiItem ? group.rentalIds.join(',') : group.rentalIds[0];

    // Action buttons - check if user is admin
    const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

    const actionButtons = showArchived
      ? (isAdmin
        ? `
<button onclick="viewRentalDetails('${group.rentalIds[0]}')" class="btn-action" title="View Details" style="padding: 6px 12px; margin: 2px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">👁️ View</button>
<button onclick="deleteRentalGroup('${group.rentalIds.join(',')}')" class="btn-action admin-only" title="Delete" style="padding: 6px 12px; margin: 2px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">🗑️ Delete</button>
`
        : `
<button onclick="viewRentalDetails('${group.rentalIds[0]}')" class="btn-action" title="View Details" style="padding: 6px 12px; margin: 2px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">👁️ View</button>
<span style="color: #999; font-size: 0.85em; font-style: italic;">No permission</span>
`)
      : (isAdmin
        ? `
<button onclick="editRental('${editIds}')" class="btn-action btn-action-edit" title="${isMultiItem ? 'Edit Group' : 'Edit'}">✏️ Edit</button>
<button onclick="archiveRentalGroup('${group.rentalIds.join(',')}')" class="btn-action btn-action-delete" title="Delete">🗑️ Delete</button>
`
        : `
<button onclick="editRental('${editIds}')" class="btn-action btn-action-edit" title="${isMultiItem ? 'Edit Group' : 'Edit'}">✏️ Edit</button>
<span style="color: #999; font-size: 0.85em; font-style: italic;">No permission</span>
`);

    // Create client display with tooltip on click
    const phone = group.client_phone || 'No phone';
    const address = group.client_address || 'No address';
    const clientDisplay = `<span onclick="showClientInfo('${group.renter_name.replace(/'/g, "\\'")}', '${phone.replace(/'/g, "\\'")}', '${address.replace(/'/g, "\\'")}')" style="cursor: pointer; color: #2196F3; text-decoration: underline;" title="Click to view contact info">${group.renter_name}</span>`;

    return `
<tr>
  <td style="max-width: 300px; white-space: normal; word-wrap: break-word;">${itemsDisplay}</td>
  <td>${clientDisplay}</td>
  <td>${totalQuantity}</td>
  <td>${group.rent_date}</td>
  <td>${group.return_date || "-"}</td>
  <td>${group.payment_status} (₱${totalPayment.toFixed(2)})</td>
  <td><span class="status-badge ${statusClass}" style="padding: 4px 12px; border-radius: 4px; background-color: ${getStatusColor(group.status)}; text-transform: uppercase; font-weight: 600; font-size: 11px;">${getStatusLabel(group.status)}</span></td>
  <td style="white-space: nowrap;">
    ${actionButtons}
  </td>
</tr>
`;
  }).join("");
}

// Show client contact information when clicking on client name
window.showClientInfo = (name, phone, address) => {
  const modalHTML = `
    <div id="clientInfoModal" class="modal" style="display:flex; align-items:center; justify-content:center;">
      <div class="modal-overlay" onclick="closeClientInfoModal()"></div>
      <div class="modal-card" style="max-width: 500px; position: relative; z-index: 1001;">
        <div class="modal-header">
          <h2>Client Contact Information</h2>
          <button onclick="closeClientInfoModal()" class="close-modal-btn" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
        </div>
        
        <div class="modal-body">
          <div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 16px 0; color: #333; font-size: 1.2rem; border-bottom: 2px solid #2196F3; padding-bottom: 8px;">${name}</h3>
          </div>

          <div style="display: grid; gap: 16px;">
            <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="font-size: 20px;">📞</span>
                <strong style="color: #666; font-size: 0.9rem;">Phone Number</strong>
              </div>
              <p style="margin: 0; font-size: 1.1rem; color: #333;">${phone}</p>
            </div>

            <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="font-size: 20px;">📍</span>
                <strong style="color: #666; font-size: 0.9rem;">Address</strong>
              </div>
              <p style="margin: 0; font-size: 1.1rem; color: #333;">${address}</p>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="margin-top: 24px; display: flex; gap: 8px; justify-content: flex-end;">
          <button onclick="closeClientInfoModal()" class="btn-cancel" style="padding: 10px 20px;">Close</button>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if any
  const existing = document.getElementById('clientInfoModal');
  if (existing) existing.remove();

  // Add to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
};

// Close client info modal
window.closeClientInfoModal = () => {
  const modal = document.getElementById('clientInfoModal');
  if (modal) modal.remove();
};

function getStatusColor(status) {
  switch (status?.toLowerCase()) {
    case 'active': return '#7bed9f';
    case 'reserved': return '#fff3cd';
    case 'overdue': return '#f8d7da';
    case 'returned': return '#e2e3e5';
    case 'cancelled': return '#f8d7da';
    default: return '#eee';
  }
}

function getStatusLabel(status) {
  switch (status?.toLowerCase()) {
    case 'active': return 'Open';
    case 'returned': return 'Closed';
    case 'reserved': return 'Reserved (Future)';
    case 'overdue': return 'Overdue';
    case 'cancelled': return 'Cancelled';
    default: return status || 'Unknown';
  }
}

function getStatusClass(status) {
  return ''; // We are using inline styles for now
}

// Expose edit function globally
window.editRental = (idsString) => {
  // Support both single ID and comma-separated IDs for grouped rentals
  fetchRentalsAndOpenModal(idsString);
};

async function fetchRentalsAndOpenModal(idsString) {
  const ids = idsString.split(',');

  // Fetch all rentals in the group
  const { data: rentals, error } = await supabase
    .from("rentals")
    .select("*")
    .in("id", ids);

  if (error || !rentals || rentals.length === 0) {
    alert("Error loading rental details");
    return;
  }

  if (rentals.length === 1) {
    // Single rental - use original edit mode
    openModal(rentals[0]);
  } else {
    // Multiple rentals - use batch edit mode
    openBatchEditModal(rentals);
  }
}

// Batch edit modal for grouped rentals
let batchEditRentals = []; // Store rentals being edited in batch mode

function openBatchEditModal(rentals) {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  // Store rentals in global variable for editing
  batchEditRentals = JSON.parse(JSON.stringify(rentals)); // Deep copy

  // Set as batch edit mode
  editRentalId = "BATCH:" + rentals.map(r => r.id).join(',');

  document.getElementById("modalTitle").innerText = `Edit Grouped Rental(${rentals.length} items)`;

  // Hide cart UI  
  addToCartSection.style.display = "none";
  cartSection.style.display = "none";

  // Hide single item/quantity fields
  rentalItem.parentElement.parentElement.style.display = "none";

  // Show batch items list instead
  let batchItemsList = document.getElementById("batchItemsList");
  if (!batchItemsList) {
    // Create batch items display if it doesn't exist
    const itemsHTML = `
<div id="batchItemsList" style="margin-bottom: 1rem; padding: 1rem; background: #f0f8ff; border: 2px solid #2196F3; border-radius: 8px;">
  <h4 style="margin-top: 0; color: #2196F3;">Items in this rental:</h4>
  <div id="batchItemsContent"></div>
  <div id="addItemToBatch" style="margin-top: 1rem; padding-top: 1rem; border-top: 2px dashed #2196F3;">
    <h5 style="margin-top: 0; color: #2196F3;">Add New Item:</h5>
    <div style="display: flex; gap: 8px; align-items: center;">
      <select id="batchNewItem" style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
        <option value="">-- Select Item --</option>
      </select>
      <input type="number" id="batchNewQty" min="1" value="1" style="width: 80px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
      <button onclick="addItemToBatchRental()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
        ➞ Add
      </button>
    </div>
  </div>
</div>
`;
    rentalItem.parentElement.parentElement.insertAdjacentHTML('afterend', itemsHTML);
    batchItemsList = document.getElementById("batchItemsList");
  }

  batchItemsList.style.display = "block";

  // Load item names and render editable table
  loadItemNamesAndRenderBatchEdit();

  // Fill common fields from first rental (they should all be the same)
  const firstRental = rentals[0];
  rentalClientName.value = firstRental.renter_name || "";
  rentalDate.value = firstRental.rent_date || "";
  returnDate.value = firstRental.return_date || "";

  paymentMethod.value = firstRental.payment_method || "Cash";
  paymentStatus.value = firstRental.payment_status || "Pending";
  rentalStatus.value = firstRental.status || "active";

  // Calculate and set total payment
  recalculateBatchPayment();

  // Enable custom price checkbox for manual override
  customPriceCheckbox.checked = false;
  paymentAmount.setAttribute("readonly", true);

  // Disable item/qty fields in batch mode (not used here)
  rentalItem.disabled = true;
  rentalQty.disabled = true;

  // Populate the "Add New Item" dropdown with available items
  populateBatchNewItemDropdown();
}


async function loadItemNamesForBatch(rentals, container) {
  // Fetch item details
  const itemIds = rentals.map(r => r.item_id);
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name")
    .in("id", itemIds);

  if (items) {
    const itemMap = {};
    items.forEach(item => {
      itemMap[item.id] = item.name;
    });

    container.innerHTML = rentals.map((r, idx) => `
<div style="padding: 8px; margin: 4px 0; background: white; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
  <span><strong>${idx + 1}.</strong> ${itemMap[r.item_id] || 'Unknown Item'}</span>
  <span style="color: #666;">Qty: ${r.quantity}</span>
</div>
`).join('');
  }
}

// NEW: Load item names and render editable batch table
async function loadItemNamesAndRenderBatchEdit() {
  const itemIds = batchEditRentals.map(r => r.item_id);
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, rental_price")
    .in("id", itemIds);

  if (items) {
    const itemMap = {};
    items.forEach(item => {
      itemMap[item.id] = item;
    });

    // Add item details to batchEditRentals
    batchEditRentals.forEach(r => {
      r.itemName = itemMap[r.item_id]?.name || 'Unknown Item';
      r.itemPrice = parseFloat(itemMap[r.item_id]?.rental_price) || 0;
    });
  }

  renderBatchEditItems();
}

// NEW: Render editable batch items table
function renderBatchEditItems() {
  const itemsContent = document.getElementById("batchItemsContent");

  if (batchEditRentals.length === 0) {
    itemsContent.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No items. Add items below.</p>';
    return;
  }

  itemsContent.innerHTML = `
<table style="width: 100%; border-collapse: collapse;">
  <thead>
    <tr style="background: #e3f2fd; text-align: left;">
      <th style="padding: 8px; border-bottom: 2px solid #2196F3;">#</th>
      <th style="padding: 8px; border-bottom: 2px solid #2196F3;">Item</th>
      <th style="padding: 8px; border-bottom: 2px solid #2196F3; text-align: center;">Quantity</th>
      <th style="padding: 8px; border-bottom: 2px solid #2196F3; text-align: right;">Price/Unit</th>
      <th style="padding: 8px; border-bottom: 2px solid #2196F3; text-align: right;">Subtotal</th>
      <th style="padding: 8px; border-bottom: 2px solid #2196F3; text-align: center;">Action</th>
    </tr>
  </thead>
  <tbody>
    ` + batchEditRentals.map((r, idx) => {
    const subtotal = r.itemPrice * r.quantity;
    return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px;">`+ (idx + 1) + `</td>
        <td style="padding: 8px;"><strong>`+ r.itemName + `</strong></td>
        <td style="padding: 8px; text-align: center;">
          <input 
            type="number" min="1" value="`+ r.quantity + `" 
            onchange="updateBatchItemQuantity(`+ idx + `, this.value)"
            style="width: 60px; padding: 4px; border: 1px solid #ccc; border-radius: 4px; text-align: center;"
          />
        </td>
        <td style="padding: 8px; text-align: right;">₱`+ r.itemPrice.toFixed(2) + `</td>
        <td style="padding: 8px; text-align: right;"><strong>₱`+ subtotal.toFixed(2) + `</strong></td>
        <td style="padding: 8px; text-align: center;">
          <button onclick="removeItemFromBatchRental(`+ idx + `)" 
            style="padding: 4px 8px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;"
            title="Remove item">🗑️</button>
        </td>
      </tr>
    `;
  }).join('') + `
  </tbody>
</table>
`;

  recalculateBatchPayment();
}

// NEW: Update quantity
window.updateBatchItemQuantity = function (index, newQty) {
  const qty = parseInt(newQty) || 1;
  if (qty < 1) {
    alert("Quantity must be at least 1");
    renderBatchEditItems();
    return;
  }
  batchEditRentals[index].quantity = qty;
  renderBatchEditItems();
};

// NEW: Remove item
window.removeItemFromBatchRental = function (index) {
  if (batchEditRentals.length === 1) {
    alert("Cannot remove the last item. At least one item is required.");
    return;
  }
  const itemName = batchEditRentals[index].itemName;
  if (confirm(`Remove "` + itemName + `" ? `)) {
    batchEditRentals.splice(index, 1);
    renderBatchEditItems();
  }
};

// NEW: Add item
window.addItemToBatchRental = async function () {
  const newItemId = document.getElementById("batchNewItem").value;
  const newQty = parseInt(document.getElementById("batchNewQty").value) || 1;
  if (!newItemId) { alert("Please select an item"); return; }

  const existingIndex = batchEditRentals.findIndex(r => String(r.item_id) === String(newItemId));
  if (existingIndex >= 0) {
    if (confirm(`Item exists.Increase quantity by` + newQty + ` ? `)) {
      batchEditRentals[existingIndex].quantity += newQty;
      renderBatchEditItems();
    }
    return;
  }

  const item = allItems.find(i => String(i.id) === String(newItemId));
  if (!item) { alert("Item not found"); return; }

  const firstRental = batchEditRentals[0];
  batchEditRentals.push({
    id: null,
    item_id: newItemId,
    itemName: item.name,
    itemPrice: parseFloat(item.rental_price) || 0,
    quantity: newQty,
    renter_name: firstRental.renter_name,
    rent_date: firstRental.rent_date,
    return_date: firstRental.return_date,
    payment_method: firstRental.payment_method,
    payment_status: firstRental.payment_status,
    status: firstRental.status,
    payment_amount: 0
  });
  renderBatchEditItems();
  document.getElementById("batchNewItem").value = "";
  document.getElementById("batchNewQty").value = 1;
};

// NEW: Populate dropdown
function populateBatchNewItemDropdown() {
  const dropdown = document.getElementById("batchNewItem");
  if (!dropdown) return;
  dropdown.innerHTML = '<option value="">-- Select Item --</option>' +
    allItems.map(i => `<option value="${i.id}">${i.name} (${i.realTimeAvailable} available)</option>`).join("");
}

// NEW: Recalculate payment
function recalculateBatchPayment() {
  if (customPriceCheckbox?.checked) return;
  const days = calculateRentalDays(rentalDate.value, returnDate.value);
  const total = batchEditRentals.reduce((sum, r) => sum + (r.itemPrice * r.quantity * days), 0);
  paymentAmount.value = total.toFixed(2);
}

// ========== MISSING ITEMS MODAL HANDLERS ==========

// Missing Items Modal Elements
const missingItemsModal = document.getElementById("missingItemsModal");
const missingItemsOverlay = document.getElementById("missingItemsOverlay");
const cancelMissingItemsBtn = document.getElementById("cancelMissingItemsBtn");
const returnChoiceSection = document.getElementById("returnChoiceSection");
const missingItemsForm = document.getElementById("missingItemsForm");
const allReturnedBtn = document.getElementById("allReturnedBtn");
const someMissingBtn = document.getElementById("someMissingBtn");
const confirmMissingBtn = document.getElementById("confirmMissingBtn");
const cancelMissingFormBtn = document.getElementById("cancelMissingFormBtn");
const missingItemsList = document.getElementById("missingItemsList");
const missingNotes = document.getElementById("missingNotes");

let currentReturnRentalIds = null; // Store rental IDs being marked as returned

// Setup modal event listeners
cancelMissingItemsBtn?.addEventListener("click", closeMissingItemsModal);
missingItemsOverlay?.addEventListener("click", closeMissingItemsModal);
cancelMissingFormBtn?.addEventListener("click", () => {
  // Go back to initial choice
  missingItemsForm.style.display = "none";
  returnChoiceSection.style.display = "block";
});

allReturnedBtn?.addEventListener("click", async () => {
  // Mark all items as returned
  await handleAllReturned();
});

someMissingBtn?.addEventListener("click", () => {
  // Show missing items form
  returnChoiceSection.style.display = "none";
  missingItemsForm.style.display = "block";
  populateMissingItemsForm();
});

confirmMissingBtn?.addEventListener("click", async () => {
  // Process missing items and complete return
  await handlePartialReturn();
});

function closeMissingItemsModal() {
  missingItemsModal.classList.add("hidden");
  missingItemsModal.setAttribute("aria-hidden", "true");
  // Reset form
  returnChoiceSection.style.display = "block";
  missingItemsForm.style.display = "none";
  missingItemsList.innerHTML = "";
  missingNotes.value = "";
  currentReturnRentalIds = null;
}

// Show missing items modal for given rental ID(s)
async function showMissingItemsModal(rentalIdOrIds) {
  currentReturnRentalIds = rentalIdOrIds;

  // Show modal
  missingItemsModal.classList.remove("hidden");
  missingItemsModal.setAttribute("aria-hidden", "false");

  // Reset to initial state
  returnChoiceSection.style.display = "block";
  missingItemsForm.style.display = "none";
}

// Populate the missing items form with inputs for each item
async function populateMissingItemsForm() {
  const ids = typeof currentReturnRentalIds === 'string'
    ? (currentReturnRentalIds.startsWith("BATCH:")
      ? currentReturnRentalIds.replace("BATCH:", "").split(',')
      : currentReturnRentalIds.split(','))
    : [currentReturnRentalIds];

  // Fetch rental details
  const { data: rentals, error } = await supabase
    .from("rentals")
    .select(`
      id, item_id, quantity, renter_name
    `)
    .in("id", ids);

  if (error || !rentals || rentals.length === 0) {
    alert("Error loading rental details");
    closeMissingItemsModal();
    return;
  }

  console.log("Rentals loaded for return:", rentals);

  // Fetch item names from both inventory_items and decorations
  const itemIds = [...new Set(rentals.map(r => r.item_id))];

  console.log("Item IDs to fetch:", itemIds);

  const { data: inventoryItems, error: invError } = await supabase
    .from("inventory_items")
    .select("id, name")
    .in("id", itemIds);

  const { data: decorations, error: decError } = await supabase
    .from("decorations")
    .select("id, name")
    .in("id", itemIds);

  console.log("Inventory items fetched:", inventoryItems);
  console.log("Decorations fetched:", decorations);
  console.log("Inventory error:", invError);
  console.log("Decorations error:", decError);

  // Create item name map and track which items are decorations
  const itemNameMap = {};
  const decorationIds = new Set();

  (inventoryItems || []).forEach(item => {
    itemNameMap[item.id] = item.name;
  });

  (decorations || []).forEach(item => {
    itemNameMap[item.id] = item.name;
    decorationIds.add(item.id); // Mark as decoration
  });

  console.log("Item name map:", itemNameMap);
  console.log("Decoration IDs:", Array.from(decorationIds));

  // Filter out decorations - only show rental items in the return form
  const rentalItemsOnly = rentals.filter(r => !decorationIds.has(r.item_id));

  // If all items are decorations, skip the modal entirely
  if (rentalItemsOnly.length === 0) {
    console.log("All items are decorations - auto-completing return");
    await handleAllReturned(); // Automatically mark as returned
    return;
  }

  // Generate form inputs for rental items only (exclude decorations)
  missingItemsList.innerHTML = rentalItemsOnly.map((rental, index) => {
    const itemName = itemNameMap[rental.item_id] || "Unknown Item";
    return `
      <div style="padding: 12px; margin-bottom: 12px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="font-size: 1rem;">${itemName}</strong>
          <span style="color: #666; font-size: 0.9rem;">Total: ${rental.quantity}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <label style="flex: 1;">
            <span style="display: block; font-size: 0.85rem; color: #666; margin-bottom: 4px;">Missing Quantity:</span>
            <input 
              type="number" 
              id="missing_${rental.id}" 
              data-rental-id="${rental.id}"
              data-item-name="${itemName}"
              data-total-qty="${rental.quantity}"
              min="0" 
              max="${rental.quantity}" 
              value="0"
              style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem;"
            />
          </label>
          <div style="flex: 1; padding: 8px; background: white; border: 1px solid #dee2e6; border-radius: 4px; text-align: center;">
            <span style="display: block; font-size: 0.85rem; color: #666; margin-bottom: 4px;">Returned:</span>
            <strong id="returned_${rental.id}" style="font-size: 1rem; color: #4caf50;">${rental.quantity}</strong>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Add event listeners to update returned count
  rentals.forEach(rental => {
    const missingInput = document.getElementById(`missing_${rental.id}`);
    const returnedDisplay = document.getElementById(`returned_${rental.id}`);

    missingInput?.addEventListener("input", () => {
      const missing = parseInt(missingInput.value) || 0;
      const returned = rental.quantity - missing;
      returnedDisplay.textContent = returned;

      // Validate
      if (missing > rental.quantity) {
        missingInput.value = rental.quantity;
        returnedDisplay.textContent = "0";
      }
      if (missing < 0) {
        missingInput.value = "0";
        returnedDisplay.textContent = rental.quantity;
      }
    });
  });
}

// Handle "All Returned" - record all items as returned
async function handleAllReturned() {
  const ids = typeof currentReturnRentalIds === 'string'
    ? (currentReturnRentalIds.startsWith("BATCH:")
      ? currentReturnRentalIds.replace("BATCH:", "").split(',')
      : currentReturnRentalIds.split(','))
    : [currentReturnRentalIds];

  try {
    // Fetch rental details WITHOUT JOIN
    const { data: rentals, error: fetchError } = await supabase
      .from("rentals")
      .select("id, item_id, quantity, renter_name")
      .in("id", ids);

    if (fetchError || !rentals) throw fetchError;

    // Fetch item names separately
    const itemIds = rentals.map(r => r.item_id).filter(Boolean);

    // Try to get names from inventory_items (for bigint IDs)
    const { data: inventoryItems } = await supabase
      .from("inventory_items")
      .select("id, name")
      .in("id", itemIds);

    // Try to get names from decorations (for uuid IDs)
    const { data: decorationItems } = await supabase
      .from("decorations")
      .select("id, name")
      .in("id", itemIds);

    // Create a map of item_id -> name and track decorations
    const itemNameMap = {};
    const decorationIds = new Set();

    if (inventoryItems) {
      inventoryItems.forEach(item => {
        itemNameMap[item.id] = item.name;
      });
    }
    if (decorationItems) {
      decorationItems.forEach(item => {
        itemNameMap[item.id] = item.name;
        decorationIds.add(item.id); // Track decorations
      });
    }

    // Separate rental items and decorations
    const rentalItems = rentals.filter(r => !decorationIds.has(r.item_id));
    const decorationSales = rentals.filter(r => decorationIds.has(r.item_id));

    // Create reports: "returned" for rental items, "sold" for decorations
    const reports = [
      ...rentalItems.map(rental => ({
        rental_id: rental.id,
        item_name: itemNameMap[rental.item_id] || "Unknown Item",
        quantity: rental.quantity,
        type: "returned",
        notes: `All items returned by ${rental.renter_name}`
      })),
      ...decorationSales.map(rental => ({
        rental_id: rental.id,
        item_name: itemNameMap[rental.item_id] || "Unknown Item",
        quantity: rental.quantity,
        type: "sold",
        notes: `Decoration sold to ${rental.renter_name}`
      }))
    ];

    const { error: insertError } = await supabase
      .from("reports")
      .insert(reports);

    if (insertError) throw insertError;

    // Update rental status to "returned"
    const { error: updateError } = await supabase
      .from("rentals")
      .update({ status: "returned" })
      .in("id", ids);

    if (updateError) throw updateError;

    // Close modals and refresh
    closeMissingItemsModal();
    closeModal();
    loadRentals();
    alert(`✓ Return recorded successfully! All ${rentals.length} item(s) marked as returned.`);

  } catch (err) {
    console.error("Error recording return:", err);
    alert("Error recording return: " + err.message);
  }
}

// Handle "Partial Return" - record missing items
async function handlePartialReturn() {
  const ids = typeof currentReturnRentalIds === 'string'
    ? (currentReturnRentalIds.startsWith("BATCH:")
      ? currentReturnRentalIds.replace("BATCH:", "").split(',')
      : currentReturnRentalIds.split(','))
    : [currentReturnRentalIds];

  try {
    const reports = [];
    const additionalNotes = missingNotes.value.trim();
    const inventoryDeductions = {}; // Track quantity to deduct per item_id

    // Fetch rental details to get item_id for inventory deduction
    const { data: rentals, error: fetchError } = await supabase
      .from("rentals")
      .select("id, item_id, quantity")
      .in("id", ids);

    if (fetchError) throw fetchError;

    // Collect data from inputs
    for (const id of ids) {
      const missingInput = document.getElementById(`missing_${id}`);
      if (!missingInput) continue;

      const rentalId = missingInput.dataset.rentalId;
      const itemName = missingInput.dataset.itemName;
      const totalQty = parseInt(missingInput.dataset.totalQty);
      const missingQty = parseInt(missingInput.value) || 0;
      const returnedQty = totalQty - missingQty;

      // Find the rental to get item_id
      const rental = rentals.find(r => String(r.id) === String(rentalId));

      // Record returned items (if any)
      if (returnedQty > 0) {
        reports.push({
          rental_id: rentalId,
          item_name: itemName,
          quantity: returnedQty,
          type: "returned",
          notes: additionalNotes || "Partial return"
        });
      }

      // Record missing items (if any)
      if (missingQty > 0) {
        reports.push({
          rental_id: rentalId,
          item_name: itemName,
          quantity: missingQty,
          type: "missing",
          notes: additionalNotes || "Items not returned"
        });

        // Track inventory deduction - sum up missing quantities per item_id
        if (rental && rental.item_id) {
          inventoryDeductions[rental.item_id] = (inventoryDeductions[rental.item_id] || 0) + missingQty;
        }
      }
    }

    if (reports.length === 0) {
      alert("Please specify item quantities");
      return;
    }

    // Insert reports
    const { error: insertError } = await supabase
      .from("reports")
      .insert(reports);

    if (insertError) throw insertError;

    // DEDUCT MISSING ITEMS FROM INVENTORY
    // Process each item_id that has missing items
    for (const [itemId, deductQty] of Object.entries(inventoryDeductions)) {
      // Fetch current inventory
      const { data: item, error: itemFetchError } = await supabase
        .from("inventory_items")
        .select("quantity_total")
        .eq("id", itemId)
        .single();

      if (itemFetchError) {
        console.error(`Error fetching inventory for item ${itemId}:`, itemFetchError);
        continue; // Continue processing other items
      }

      if (item) {
        const newTotal = Math.max(0, item.quantity_total - deductQty); // Ensure non-negative

        // Update inventory quantity_total
        const { error: updateInventoryError } = await supabase
          .from("inventory_items")
          .update({ quantity_total: newTotal })
          .eq("id", itemId);

        if (updateInventoryError) {
          console.error(`Error updating inventory for item ${itemId}:`, updateInventoryError);
        } else {
          console.log(`Deducted ${deductQty} from item ${itemId}. New total: ${newTotal}`);
        }
      }
    }

    // Update rental status to "returned"
    const { error: updateError } = await supabase
      .from("rentals")
      .update({ status: "returned" })
      .in("id", ids);

    if (updateError) throw updateError;

    // Count returned and missing
    const returnedCount = reports.filter(r => r.type === "returned").length;
    const missingCount = reports.filter(r => r.type === "missing").length;
    const totalMissingQty = Object.values(inventoryDeductions).reduce((sum, qty) => sum + qty, 0);

    // Close modals and refresh
    closeMissingItemsModal();
    closeModal();
    loadRentals();

    let message = "✓ Return recorded successfully!";
    if (returnedCount > 0) message += `\n${returnedCount} item(s) marked as returned.`;
    if (missingCount > 0) {
      message += `\n${missingCount} item(s) marked as missing.`;
      message += `
⚠️ Inventory reduced by ${totalMissingQty} unit(s).`;
    }
    alert(message);

  } catch (err) {
    console.error("Error recording partial return:", err);
    alert("Error recording return: " + err.message);
  }
}


// ========== CALENDAR VIEW ==========

let calendar;

// Tab switching
document.getElementById('listViewTab')?.addEventListener('click', () => switchView('list'));
document.getElementById('calendarViewTab')?.addEventListener('click', () => switchView('calendar'));

function switchView(view) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Update view containers
  document.getElementById('listView').classList.toggle('hidden', view !== 'list');
  document.getElementById('calendarView').classList.toggle('hidden', view !== 'calendar');

  // Initialize calendar if switching to calendar view for first time
  if (view === 'calendar' && !window.calendarInitialized) {
    initializeCalendar();
    window.calendarInitialized = true;
  }

  // Re-render icons
  lucide.createIcons();
}

async function initializeCalendar() {
  const calendarEl = document.getElementById('calendar');

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    events: await fetchCalendarEvents(),
    eventClick: handleEventClick,
    height: 'auto',
    eventDisplay: 'block'
  });

  calendar.render();
}

async function fetchCalendarEvents() {
  try {
    // Fetch rentals
    const { data: rentals } = await supabase
      .from("rentals")
      .select("*")
      .or('archived.is.null,archived.eq.false');

    // Fetch item names
    const { data: inventoryItems } = await supabase
      .from("inventory_items")
      .select("id, name");

    const { data: decorations } = await supabase
      .from("decorations")
      .select("id, name");

    const itemMap = {};
    [...(inventoryItems || []), ...(decorations || [])].forEach(item => {
      itemMap[String(item.id)] = item.name;
    });

    // Transform to calendar events
    return rentals.map(rental => ({
      id: rental.id,
      title: `${rental.renter_name} - ${itemMap[String(rental.item_id)] || 'Unknown'}`,
      start: rental.rent_date,
      end: rental.return_date,
      backgroundColor: getStatusColor(rental.status),
      borderColor: getStatusColor(rental.status),
      extendedProps: {
        rentalData: rental
      }
    }));
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return [];
  }
}

// Function to refresh calendar with latest data
async function refreshCalendar() {
  if (calendar && window.calendarInitialized) {
    const events = await fetchCalendarEvents();
    calendar.removeAllEvents();
    calendar.addEventSource(events);
  }
}

// getStatusColor already declared earlier in file (line 1432)
// function getStatusColor(status) {
//     const colors = {
//         'active': '#2196F3',      // Blue
//         'reserved': '#9C27B0',    // Purple
//         'overdue': '#f44336',     // Red
//         'returned': '#4caf50'     // Green
//     };
//     return colors[status] || '#666';
// }


function handleEventClick(info) {
  const rental = info.event.extendedProps.rentalData;
  const message = `Rental Details:\n\nCustomer: ${rental.renter_name}\nDates: ${rental.rent_date} to ${rental.return_date}\nStatus: ${rental.status}\nPayment: ₱${rental.payment_amount}`;
  alert(message);
  // TODO: Open existing rental modal with data for editing
}
