// item-search.js - Searchable item dropdown functionality
// This module handles the search/autocomplete feature for selecting rental items

export class ItemSearch {
    constructor() {
        this.selectedIndex = -1;
        this.searchInput = document.getElementById('rentalItemSearch');
        this.searchResults = document.getElementById('itemSearchResults');
        this.hiddenInput = document.getElementById('rentalItem');
        this.qtyInput = document.getElementById('rentalQty');
        this.showAllBtn = document.getElementById('showAllItemsBtn');
        this.allItems = [];

        this.init();
    }

    init() {
        if (!this.searchInput || !this.searchResults) {
            console.warn('Search elements not found');
            return;
        }

        // Event listeners
        this.searchInput.addEventListener('input', () => this.handleSearch());
        this.searchInput.addEventListener('keydown', (e) => this.handleKeyboard(e));
        this.searchInput.addEventListener('focus', () => {
            // Show dropdown on focus
            if (this.searchInput.value.trim()) {
                this.handleSearch();
            } else {
                this.showAllItems();
            }
        });

        // Show all items button
        if (this.showAllBtn) {
            this.showAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showAllItems();
                this.searchInput.focus();
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.searchInput.contains(e.target) &&
                !this.searchResults.contains(e.target) &&
                !this.showAllBtn?.contains(e.target)) {
                this.closeDropdown();
            }
        });
    }

    // Set available items for searching
    setItems(items) {
        this.allItems = items;
        console.log('ItemSearch: setItems called with', items.length, 'items');
    }

    // Show all available items (when clicking dropdown button or focusing empty field)
    showAllItems() {
        if (this.allItems.length === 0) {
            this.searchResults.innerHTML = `
        <div class="search-no-results">
          No items available
        </div>
      `;
            this.searchResults.classList.remove('hidden');
            return;
        }

        this.renderItems(this.allItems);
        this.searchResults.classList.remove('hidden');
    }

    // Filter and display search results
    handleSearch() {
        const query = this.searchInput.value.toLowerCase().trim();

        // If empty, show all items
        if (!query) {
            this.showAllItems();
            return;
        }

        // Filter items
        const filtered = this.allItems.filter(item =>
            item.name.toLowerCase().includes(query) ||
            (item.category && item.category.toLowerCase().includes(query)) ||
            (item.type && item.type.toLowerCase().includes(query))
        );

        // Render results
        if (filtered.length === 0) {
            this.searchResults.innerHTML = `
        <div class="search-no-results">
          No items found matching "${query}"
        </div>
      `;
        } else {
            this.renderItems(filtered);
        }

        this.searchResults.classList.remove('hidden');
        this.selectedIndex = -1;
    }

    // Render items in dropdown
    renderItems(items) {
        this.searchResults.innerHTML = items.map((item, index) => {
            const available = item.realTimeAvailable ?? item.quantity_available ?? 0;
            const availabilityClass = available > 10 ? 'available' :
                available > 0 ? 'low' : 'unavailable';
            const availabilityText = available > 0 ?
                `${available} available` : 'Out of stock';

            return `
        <div class="search-result-item" data-index="${index}" data-item-id="${item.id}">
          <div class="search-item-name">${item.name}</div>
          <div class="search-item-details">
            <span class="search-item-price">₱${parseFloat(item.rental_price || 0).toFixed(2)}</span>
            <span class="search-item-availability ${availabilityClass}">
              ${availabilityText}
            </span>
          </div>
        </div>
      `;
        }).join('');

        // Add click handlers
        this.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => this.selectItem(item.dataset.itemId));
        });
    }

    // Select an item from search results
    selectItem(itemId) {
        const item = this.allItems.find(i => String(i.id) === String(itemId));
        if (!item) return;

        // Update inputs
        this.searchInput.value = item.name;
        this.hiddenInput.value = item.id;

        // Close dropdown
        this.closeDropdown();

        // Trigger change event for price calculation
        const changeEvent = new Event('change', { bubbles: true });
        this.hiddenInput.dispatchEvent(changeEvent);

        // Focus quantity input
        if (this.qtyInput) {
            this.qtyInput.focus();
            this.qtyInput.select();
        }
    }

    // Handle keyboard navigation
    handleKeyboard(e) {
        const items = this.searchResults.querySelectorAll('.search-result-item');

        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
            this.updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
            this.updateSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.selectedIndex >= 0) {
                const selectedItem = items[this.selectedIndex];
                this.selectItem(selectedItem.dataset.itemId);
            }
        } else if (e.key === 'Escape') {
            this.closeDropdown();
            this.searchInput.blur();
        }
    }

    // Update visual selection
    updateSelection(items) {
        items.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    // Close the dropdown
    closeDropdown() {
        this.searchResults.classList.add('hidden');
        this.selectedIndex = -1;
    }

    // Clear the search
    clear() {
        this.searchInput.value = '';
        this.hiddenInput.value = '';
        this.closeDropdown();
    }
}
