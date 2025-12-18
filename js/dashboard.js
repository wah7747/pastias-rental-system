// js/dashboard.js
import { supabase } from "./supabase.js";

/**
 * Very simple demo: load counts for dashboard cards.
 * Adjust table names/columns if needed.
 */
async function loadDashboardStats() {
  try {
    // 1. KPIs
    // Total Rentals (non-archived)
    const { count: rentalsCount } = await supabase
      .from("rentals")
      .select("*", { count: "exact", head: true })
      .or('archived.is.null,archived.eq.false');

    // Count inventory items (non-archived, with available quantity)
    const { count: itemsCount } = await supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .eq("archived", false)
      .gt("quantity_available", 0);

    // Count decorations (non-archived, with available quantity)
    const { count: decorationsCount } = await supabase
      .from("decorations")
      .select("*", { count: "exact", head: true })
      .eq("archived", false)
      .gt("quantity_available", 0);

    // Total available items = inventory items + decorations
    const totalAvailable = (itemsCount ?? 0) + (decorationsCount ?? 0);

    // Active Rentals count - count grouped transactions, not individual records
    // Fetch all active rentals
    const { data: activeRentalsData } = await supabase
      .from("rentals")
      .select("renter_name, rent_date, return_date, status, payment_status, payment_method")
      .eq("status", "active")
      .or('archived.is.null,archived.eq.false');

    // Group rentals by same criteria as rentals page
    const groupedActiveRentals = {};
    if (activeRentalsData) {
      activeRentalsData.forEach(r => {
        const groupKey = `${r.renter_name}|${r.rent_date}|${r.return_date}|${r.status}|${r.payment_status}|${r.payment_method}`;
        if (!groupedActiveRentals[groupKey]) {
          groupedActiveRentals[groupKey] = true;
        }
      });
    }
    const activeRentalsCount = Object.keys(groupedActiveRentals).length;

    // Pending Returns: Active rentals that are past or on their return date (overdue, exclude archived)
    const today = new Date().toISOString().split('T')[0];
    const { count: overdueCount } = await supabase
      .from("rentals")
      .select("*", { count: "exact", head: true })
      .or('archived.is.null,archived.eq.false')
      .eq("status", "active")
      .lte("return_date", today);

    const elTotalRentals = document.getElementById("kpi-total-rentals");
    const elItems = document.getElementById("kpi-available-items");
    const elPending = document.getElementById("kpi-pending-returns");
    const elActiveRentals = document.getElementById("kpi-active-rentals");

    if (elTotalRentals) elTotalRentals.textContent = rentalsCount ?? 0;
    if (elItems) elItems.textContent = totalAvailable ?? 0;
    if (elPending) elPending.textContent = overdueCount ?? 0;
    if (elActiveRentals) elActiveRentals.textContent = activeRentalsCount ?? 0;

    // 2. Charts
    await loadCharts();

  } catch (err) {
    console.error("Error loading dashboard stats:", err);
  }
}

async function loadCharts() {
  try {
    // Fetch rentals to aggregate (exclude archived)
    const { data: rentals, error } = await supabase
      .from("rentals")
      .select("rent_date")
      .or('archived.is.null,archived.eq.false');

    if (error) {
      console.error("Error fetching rentals:", error);
      return;
    }

    if (!rentals || rentals.length === 0) {
      console.log("No rental data available for charts");
      // Show empty state message
      showEmptyChartMessage('rentalChart', 'No rental data yet');
      showEmptyChartMessage('monthlyChart', 'No rental data yet');
      return;
    }

    // Weekly Data (Last 7 days)
    const weeklyCtx = document.getElementById('rentalChart')?.getContext('2d');
    if (weeklyCtx) {
      const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i)); // Start from 6 days ago to today
        return d.toISOString().split('T')[0];
      });

      const weeklyCounts = last7Days.map(date =>
        rentals.filter(r => r.rent_date === date).length
      );

      new Chart(weeklyCtx, {
        type: 'line',
        data: {
          labels: last7Days.map(d => {
            const date = new Date(d);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }),
          datasets: [{
            label: 'Rentals',
            data: weeklyCounts,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1
              }
            }
          }
        }
      });
    }

    // Monthly Data (Last 6 months)
    const monthlyCtx = document.getElementById('monthlyChart')?.getContext('2d');
    if (monthlyCtx) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();

      // Build array of last 6 months with their year
      const last6Months = [...Array(6)].map((_, i) => {
        const monthsBack = 5 - i;
        const targetMonth = (currentMonth - monthsBack + 12) % 12;
        const targetYear = currentYear - Math.floor((currentMonth - monthsBack) / 12);
        return { month: months[targetMonth], year: targetYear };
      });

      const monthlyCounts = last6Months.map(({ month, year }) =>
        rentals.filter(r => {
          const d = new Date(r.rent_date);
          return months[d.getMonth()] === month && d.getFullYear() === year;
        }).length
      );

      new Chart(monthlyCtx, {
        type: 'bar',
        data: {
          labels: last6Months.map(m => m.month),
          datasets: [{
            label: 'Rentals',
            data: monthlyCounts,
            backgroundColor: '#2563eb',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1
              }
            }
          }
        }
      });
    }
  } catch (err) {
    console.error("Error loading charts:", err);
  }
}

function showEmptyChartMessage(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (canvas) {
    const parent = canvas.parentElement;
    parent.innerHTML = `<p style="text-align: center; color: #9ca3af; padding: 40px;">${message}</p>`;
  }
}

// ---------- AUTOMATED ALERTS ----------

// Fetch and display all dashboard alerts
async function loadDashboardAlerts() {
  try {
    await Promise.all([
      loadLowStockAlert(),
      loadOverdueAlert(),
      loadPendingPaymentsAlert(),
      loadDueSoonAlert()
    ]);
  } catch (error) {
    console.error("Error loading dashboard alerts:", error);
  }
}

// Low Stock Alert - items below threshold
async function loadLowStockAlert() {
  try {
    // Fetch inventory items below threshold
    const { data: inventoryItems } = await supabase
      .from("inventory_items")
      .select("name, quantity_available, stock_threshold")
      .eq("archived", false);

    const { data: decorations } = await supabase
      .from("decorations")
      .select("name, quantity_available, stock_threshold")
      .eq("archived", false);

    const allItems = [...(inventoryItems || []), ...(decorations || [])];
    const lowStockItems = allItems.filter(item =>
      item.quantity_available <= (item.stock_threshold || 5)
    );

    const countElement = document.getElementById("lowStockCount");
    if (countElement) {
      if (lowStockItems.length === 0) {
        countElement.textContent = "All good ✓";
        countElement.style.color = "#4caf50";
      } else {
        countElement.textContent = `${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''}`;
        countElement.style.color = "#ff9800";
      }
    }
  } catch (error) {
    console.error("Error loading low stock alert:", error);
  }
}

// Overdue Rentals Alert
async function loadOverdueAlert() {
  try {
    const { data: overdueRentals } = await supabase
      .from("rentals")
      .select("id")
      .eq("status", "overdue")
      .or('archived.is.null,archived.eq.false');

    const countElement = document.getElementById("overdueCount");
    if (countElement) {
      const count = overdueRentals?.length || 0;

      if (count === 0) {
        countElement.textContent = "None ✓";
        countElement.style.color = "#4caf50";
      } else {
        countElement.textContent = `${count} rental${count > 1 ? 's' : ''}`;
        countElement.style.color = "#f44336";
      }
    }
  } catch (error) {
    console.error("Error loading overdue alert:", error);
  }
}

// Pending Payments Alert
async function loadPendingPaymentsAlert() {
  try {
    const { data: pendingPayments } = await supabase
      .from("rentals")
      .select("payment_amount, payment_status")
      .in("payment_status", ["Pending", "Partial"])
      .or('archived.is.null,archived.eq.false');

    const total = pendingPayments?.reduce((sum, r) => sum + (r.payment_amount || 0), 0) || 0;

    const countElement = document.getElementById("pendingPaymentsAmount");
    if (countElement) {
      if (total === 0) {
        countElement.textContent = "All paid ✓";
        countElement.style.color = "#4caf50";
      } else {
        countElement.textContent = `₱${total.toFixed(2)}`;
        countElement.style.color = "#2196F3";
      }
    }
  } catch (error) {
    console.error("Error loading pending payments alert:", error);
  }
}

// Due Soon Alert - returns in next 3 days
async function loadDueSoonAlert() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const endDate = threeDaysLater.toISOString().split('T')[0];

    const { data: dueSoon } = await supabase
      .from("rentals")
      .select("id")
      .eq("status", "active")
      .gte("return_date", today)
      .lte("return_date", endDate)
      .or('archived.is.null,archived.eq.false');

    const countElement = document.getElementById("dueSoonCount");
    if (countElement) {
      const count = dueSoon?.length || 0;

      if (count === 0) {
        countElement.textContent = "None";
        countElement.style.color = "#666";
      } else {
        countElement.textContent = `${count} rental${count > 1 ? 's' : ''}`;
        countElement.style.color = "#4caf50";
      }
    }
  } catch (error) {
    console.error("Error loading due soon alert:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadDashboardStats();
  await loadDashboardAlerts();

  // Refresh alerts every 2 minutes
  setInterval(loadDashboardAlerts, 120000);
});
