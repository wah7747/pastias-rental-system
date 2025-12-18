// js/reports.js
import { supabase } from "./supabase.js";
import { isLoggedIn, getCurrentUserProfile } from "./auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  const logged = await isLoggedIn();
  if (!logged) {
    window.location.href = "index.html";
    return;
  }

  const profile = await getCurrentUserProfile();
  if (profile) {
    document.getElementById("welcomeUser").innerText = `Welcome, ${profile.fullname}`;

    // Hide admin-only elements for non-admins
    if (profile.role !== 'Admin') {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'none';
      });
    }
  }

  loadAnalytics();
  loadIncidentReports();

  // Modal Handlers
  const addReportBtn = document.getElementById("addReportBtn");
  const modal = document.getElementById("addReportModal");
  const closeBtn = document.getElementById("cancelReportBtn");
  const overlay = document.getElementById("addReportOverlay");
  const saveBtn = document.getElementById("saveReportBtn");

  addReportBtn?.addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  });

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    // Clear fields
    document.getElementById("reportRentalId").value = "";
    document.getElementById("reportItemName").value = "";
    document.getElementById("reportQuantity").value = "1";
    document.getElementById("reportNotes").value = "";
  }

  closeBtn?.addEventListener("click", closeModal);
  overlay?.addEventListener("click", closeModal);

  saveBtn?.addEventListener("click", async () => {
    const rentalId = document.getElementById("reportRentalId").value;
    const itemName = document.getElementById("reportItemName").value;
    const quantity = document.getElementById("reportQuantity").value;
    const type = document.getElementById("reportType").value;
    const notes = document.getElementById("reportNotes").value;

    if (!itemName || !quantity || !type) {
      alert("Please fill required fields (Item Name, Quantity, Type)");
      return;
    }

    saveBtn.disabled = true;
    try {
      const { error } = await supabase.from("reports").insert({
        rental_id: rentalId ? parseInt(rentalId) : null,
        item_name: itemName,
        quantity: parseInt(quantity),
        type: type,
        notes: notes
      });

      if (error) throw error;

      closeModal();
      loadIncidentReports();
    } catch (err) {
      alert("Error saving report: " + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });
});

async function loadAnalytics() {
  // 1. Fetch Rentals for Revenue & Active Counts (include all rentals for revenue)
  const { data: rentals, error: rentalError } = await supabase
    .from("rentals")
    .select("payment_amount, payment_method, status, archived");

  if (!rentalError && rentals) {
    console.log("Rentals for revenue calculation:", rentals);
    console.log("Number of rentals:", rentals.length);

    // Calculate Revenue - ensure payment_amount is properly parsed as a number
    const totalRevenue = rentals.reduce((sum, r) => {
      const amount = parseFloat(r.payment_amount) || 0;
      console.log(`Rental payment: ${r.payment_amount} -> ${amount}`);
      return sum + amount;
    }, 0);

    console.log("Total Revenue:", totalRevenue);
    document.getElementById("reportRevenue").textContent = `₱${totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Calculate Active Rentals (exclude archived)
    const activeCount = rentals.filter(r => r.status === 'active' && !r.archived).length;
    document.getElementById("reportActiveRentals").textContent = activeCount;

    // Chart: Revenue by Method
    const methodStats = {};
    rentals.forEach(r => {
      const method = r.payment_method || "Unknown";
      const amount = parseFloat(r.payment_amount) || 0;
      methodStats[method] = (methodStats[method] || 0) + amount;
    });

    renderPieChart("revenueChart", Object.keys(methodStats), Object.values(methodStats), "Revenue Source");
  }

  // 2. Fetch Inventory Items and Decorations
  const { data: items, error: itemError } = await supabase
    .from("inventory_items")
    .select("quantity_total, quantity_available")
    .eq("archived", false);

  const { data: decorations, error: decorError } = await supabase
    .from("decorations")
    .select("quantity_total, quantity_available")
    .eq("archived", false);

  if (!itemError && items) {
    // Calculate totals including decorations
    const allItems = [...(items || []), ...(decorations || [])];

    const totalItems = allItems.reduce((sum, i) => sum + (i.quantity_total || 0), 0);
    const totalAvailable = allItems.reduce((sum, i) => sum + (i.quantity_available || 0), 0);
    const totalRented = totalItems - totalAvailable;

    document.getElementById("reportTotalItems").textContent = totalItems;

    // Chart: Inventory Status (Available vs Rented)
    if (totalItems > 0) {
      renderDoughnutChart(
        "inventoryChart",
        ["Available", "Currently Rented"],
        [totalAvailable, totalRented],
        ["#4caf50", "#ff9800"]
      );
    } else {
      // Show empty state if no items
      const canvas = document.getElementById("inventoryChart");
      if (canvas) {
        const parent = canvas.parentElement;
        parent.innerHTML = `<p style="text-align: center; color: #9ca3af; padding: 40px;">No inventory data yet</p>`;
      }
    }
  }
}

function renderPieChart(canvasId, labels, data, label) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        backgroundColor: ['#36a2eb', '#ff6384', '#ffcd56', '#4bc0c0'],
      }]
    }
  });
}

function renderDoughnutChart(canvasId, labels, data, colors) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
      }]
    }
  });
}

async function loadIncidentReports() {
  const returnedBody = document.querySelector("#returnedTableBody");
  const missingBody = document.querySelector("#missingTableBody");

  if (!returnedBody || !missingBody) return;

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading reports:", error);
    return;
  }

  returnedBody.innerHTML = "";
  missingBody.innerHTML = "";

  // Group reports by creation time and notes (items returned together in same batch)
  const groupedReports = {
    returned: {},
    missing: {}
  };

  data.forEach((report) => {
    const type = report.type;
    if (!type || (type !== "returned" && type !== "missing")) return;

    // Group by created_at timestamp (rounded to nearest second) + notes
    // This groups items that were returned together in the same batch
    const timestamp = new Date(report.created_at).toISOString().split('.')[0]; // Remove milliseconds
    const notes = report.notes || "";
    const groupKey = `${timestamp}_${notes}`;

    if (!groupedReports[type][groupKey]) {
      groupedReports[type][groupKey] = {
        rental_id: report.rental_id,
        notes: report.notes,
        created_at: report.created_at,
        items: [],
        reportIds: []
      };
    }

    groupedReports[type][groupKey].items.push({
      name: report.item_name,
      quantity: report.quantity
    });
    groupedReports[type][groupKey].reportIds.push(report.id);
  });

  // Render grouped returned items
  const returnedGroups = Object.values(groupedReports.returned);
  if (returnedGroups.length === 0) {
    returnedBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #999;">NO RETURNED ITEMS RECORDED.</td></tr>';
  } else {
    returnedGroups.forEach(group => {
      const tr = document.createElement("tr");

      // Display items: "Chair (5), Table (3), Tent (2)"
      const itemsDisplay = group.items.map(item =>
        `${item.name} (${item.quantity})`
      ).join(', ');

      // Sum total quantity
      const totalQuantity = group.items.reduce((sum, item) => sum + item.quantity, 0);

      tr.innerHTML = `
        <td style="max-width: 300px; white-space: normal; word-wrap: break-word;">${itemsDisplay}</td>
        <td>${totalQuantity}</td>
        <td>${group.notes ?? ""}</td>
        <td style="white-space: nowrap;">
          <button onclick="deleteReportGroup('${group.reportIds.join(',')}')" class="btn-action admin-only" title="Delete" style="padding: 6px 12px; margin: 2px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">🗑️ Delete</button>
        </td>
      `;
      returnedBody.appendChild(tr);
    });
  }

  // Render grouped missing items
  const missingGroups = Object.values(groupedReports.missing);
  if (missingGroups.length === 0) {
    missingBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #999;">NO MISSING ITEMS RECORDED.</td></tr>';
  } else {
    missingGroups.forEach(group => {
      const tr = document.createElement("tr");

      // Display items: "Chair (2), Table (1)"
      const itemsDisplay = group.items.map(item =>
        `${item.name} (${item.quantity})`
      ).join(', ');

      // Sum total quantity
      const totalQuantity = group.items.reduce((sum, item) => sum + item.quantity, 0);

      tr.innerHTML = `
        <td style="max-width: 300px; white-space: normal; word-wrap: break-word;">${itemsDisplay}</td>
        <td>${totalQuantity}</td>
        <td>${group.notes ?? ""}</td>
        <td style="white-space: nowrap;">
          <button onclick="deleteReportGroup('${group.reportIds.join(',')}')" class="btn-action admin-only" title="Delete" style="padding: 6px 12px; margin: 2px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">🗑️ Delete</button>
        </td>
      `;
      missingBody.appendChild(tr);
    });
  }
}

// Delete report function
window.deleteReport = async (reportId) => {
  // Check permissions first
  const profile = await getCurrentUserProfile();

  console.log("Delete report - User profile:", profile); // Debug log

  if (!profile || profile.role?.toLowerCase() !== 'admin') {
    console.error("Permission denied - Role:", profile?.role); // Debug log
    alert("Permission denied. Only Admins can delete reports.");
    return;
  }

  if (!confirm("Are you sure you want to delete this report? This cannot be undone.")) {
    return;
  }

  try {
    const { error } = await supabase
      .from("reports")
      .delete()
      .eq("id", reportId);

    if (error) throw error;

    alert("Report deleted successfully.");
    loadIncidentReports();
  } catch (err) {
    console.error("Error deleting report:", err);
    alert("Error deleting report: " + err.message);
  }
};

// Delete grouped reports function
window.deleteReportGroup = async (idsString) => {
  // Check permissions first
  const profile = await getCurrentUserProfile();

  if (!profile || profile.role?.toLowerCase() !== 'admin') {
    alert("Permission denied. Only Admins can delete reports.");
    return;
  }

  const ids = idsString.split(',');
  const count = ids.length;

  if (!confirm(`Are you sure you want to delete ${count} report(s)? This cannot be undone.`)) {
    return;
  }

  try {
    let successCount = 0;
    for (const id of ids) {
      const { error } = await supabase
        .from("reports")
        .delete()
        .eq("id", id);

      if (!error) {
        successCount++;
      }
    }

    if (successCount > 0) {
      alert(`Successfully deleted ${successCount} out of ${count} report(s).`);
      loadIncidentReports();
    } else {
      alert("Could not delete reports.");
    }
  } catch (err) {
    console.error("Error deleting reports:", err);
    alert("Error deleting reports: " + err.message);
  }
};

