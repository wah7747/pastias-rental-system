// Add Quick Actions functionality to dashboard
document.addEventListener("DOMContentLoaded", () => {
    // Quick Add Item - Navigate to Inventory and trigger add
    const quickAddItem = document.getElementById("quickAddItem");
    if (quickAddItem) {
        quickAddItem.addEventListener("click", () => {
            // Store intent in sessionStorage so inventory page knows to open modal
            sessionStorage.setItem("openAddItemModal", "true");
            window.location.href = "inventory.html";
        });
    }

    // Quick Add Rental - Navigate to Rentals and trigger add
    const quickAddRental = document.getElementById("quickAddRental");
    if (quickAddRental) {
        quickAddRental.addEventListener("click", () => {
            // Store intent in sessionStorage so rentals page knows to open modal
            sessionStorage.setItem("openAddRentalModal", "true");
            window.location.href = "rentals.html";
        });
    }
});
