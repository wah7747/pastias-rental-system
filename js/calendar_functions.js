
// ========== CALENDAR VIEW ==========

import { supabase } from "./supabase.js";

let calendar;
let selectedItemId = null; // Track selected item for availability view

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

    // Populate item filter dropdown
    await populateItemFilterDropdown();

    // Setup filter event listeners
    setupCalendarFilters();
}

// Populate item dropdown for calendar filter
async function populateItemFilterDropdown() {
    const select = document.getElementById('calendarItemFilter');
    if (!select) return;

    // Fetch all items
    const { data: inventoryItems } = await supabase
        .from('inventory_items')
        .select('id, name')
        .eq('archived', false)
        .order('name');

    const { data: decorations } = await supabase
        .from('decorations')
        .select('id, name')
        .eq('archived', false)
        .order('name');

    const allItems = [
        ...(inventoryItems || []).map(i => ({ ...i, type: 'rental' })),
        ...(decorations || []).map(i => ({ ...i, type: 'decoration' }))
    ];

    // Clear existing options except first
    select.innerHTML = '<option value="">-- Show All Rentals --</option>';

    // Add items
    allItems.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.name} (${item.type})`;
        select.appendChild(option);
    });
}

// Setup calendar filter event listeners
function setupCalendarFilters() {
    const itemFilter = document.getElementById('calendarItemFilter');
    const clearFilterBtn = document.getElementById('clearItemFilter');
    const legend = document.getElementById('availabilityLegend');

    itemFilter?.addEventListener('change', async (e) => {
        selectedItemId = e.target.value || null;

        // Show/hide legend based on selection
        if (selectedItemId && legend) {
            legend.classList.remove('hidden');
        } else if (legend) {
            legend.classList.add('hidden');
        }

        // Refresh calendar
        if (calendar) {
            const events = await fetchCalendarEvents();
            calendar.removeAllEvents();
            calendar.addEventSource(events);
        }
    });

    clearFilterBtn?.addEventListener('click', () => {
        if (itemFilter) itemFilter.value = '';
        selectedItemId = null;
        if (legend) legend.classList.add('hidden');
        refreshCalendar();
    });

    // Status filters
    const statusFilters = ['filterActive', 'filterReserved', 'filterCancelled'];
    statusFilters.forEach(filterId => {
        document.getElementById(filterId)?.addEventListener('change', refreshCalendar);
    });
}

async function fetchCalendarEvents() {
    try {
        // If item is selected, show availability for that item
        if (selectedItemId) {
            return await fetchItemAvailabilityEvents(selectedItemId);
        }

        // Otherwise show all rentals
        return await fetchRentalEvents();
    } catch (error) {
        console.error("Error fetching calendar events:", error);
        return [];
    }
}

// Fetch all rental events (normal calendar view)
async function fetchRentalEvents() {
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
    return rentals.map(rental => {
        // Determine if this is a timed event or all-day event
        const hasTime = rental.rent_time && rental.return_time;

        console.log(`Event for ${rental.renter_name}:`, {
            rent_time: rental.rent_time,
            return_time: rental.return_time,
            hasTime: hasTime
        });

        // Create concise title
        let title;
        if (hasTime) {
            // Shortened format: "7:30AM-3:30PM xavier"
            const startTime = formatTime(rental.rent_time);
            const endTime = formatTime(rental.return_time);
            title = `${startTime}-${endTime} ${rental.renter_name}`;
        } else {
            // All-day: just customer name
            title = rental.renter_name;
        }

        // Create event object
        const event = {
            id: rental.id,
            title: title,
            backgroundColor: getStatusColor(rental.status),
            borderColor: getStatusColor(rental.status),
            extendedProps: {
                rentalData: rental
            }
        };

        // Set start/end based on whether times are present
        if (hasTime) {
            // Time-based event: use datetime format
            event.start = `${rental.rent_date}T${rental.rent_time}`;
            event.end = `${rental.return_date}T${rental.return_time}`;
            event.allDay = false;
            console.log(`Creating TIMED event:`, { start: event.start, end: event.end, allDay: event.allDay });
        } else {
            // All-day event: use date format
            event.start = rental.rent_date;
            event.end = rental.return_date;
            event.allDay = true;
            console.log(`Creating ALL-DAY event:`, { start: event.start, end: event.end, allDay: event.allDay });
        }

        return event;
    });
}

// NEW: Fetch availability events for a specific item
async function fetchItemAvailabilityEvents(itemId) {
    // Get item details
    let item = null;
    const { data: invItem } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', itemId)
        .single();

    if (invItem) {
        item = invItem;
    } else {
        const { data: decItem } = await supabase
            .from('decorations')
            .select('*')
            .eq('id', itemId)
            .single();
        item = decItem;
    }

    if (!item) return [];

    const totalQuantity = item.quantity_total || 0;

    // Get all rentals for this item
    const { data: rentals } = await supabase
        .from('rentals')
        .select('*')
        .eq('item_id', itemId)
        .in('status', ['active', 'reserved'])
        .or('archived.is.null,archived.eq.false');

    // Calculate availability by date
    const availabilityMap = {};
    const events = [];

    // Process all rentals to build availability map
    (rentals || []).forEach(rental => {
        const startDate = new Date(rental.rent_date);
        const endDate = new Date(rental.return_date || rental.rent_date);

        // For each date in the rental period
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateKey = d.toISOString().split('T')[0];

            if (!availabilityMap[dateKey]) {
                availabilityMap[dateKey] = {
                    totalBooked: 0,
                    rentals: []
                };
            }

            availabilityMap[dateKey].totalBooked += rental.quantity || 0;
            availabilityMap[dateKey].rentals.push(rental);
        }
    });

    // Create availability events for next 90 days
    const today = new Date();
    for (let i = 0; i < 90; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split('T')[0];

        const booked = availabilityMap[dateKey]?.totalBooked || 0;
        const available = totalQuantity - booked;
        const availabilityPercent = (available / totalQuantity) * 100;

        // Color code by availability
        let color;
        let status;
        if (availabilityPercent >= 100) {
            color = '#4caf50'; // Green - fully available
            status = 'Available';
        } else if (availabilityPercent > 0) {
            color = '#ff9800'; // Orange - partially available
            status = 'Partially Booked';
        } else {
            color = '#f44336'; // Red - fully booked
            status = 'Fully Booked';
        }

        events.push({
            title: `${item.name}: ${available}/${totalQuantity} available`,
            start: dateKey,
            end: dateKey,
            backgroundColor: color,
            borderColor: color,
            allDay: true,
            extendedProps: {
                availabilityData: {
                    item: item.name,
                    available,
                    total: totalQuantity,
                    booked,
                    status,
                    rentals: availabilityMap[dateKey]?.rentals || []
                }
            }
        });
    }

    return events;
}

// Format time from 24-hour to 12-hour with AM/PM
function formatTime(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const h = parseInt(hours);

    // Determine AM/PM
    const ampm = h >= 12 ? 'PM' : 'AM';

    // Convert to 12-hour format
    let h12 = h % 12;
    if (h12 === 0) h12 = 12; // Handle midnight (0) and noon (12)

    return `${h12}:${minutes}${ampm}`;
}

function getStatusColor(status) {
    const colors = {
        'active': '#2196F3',      // Blue
        'reserved': '#9C27B0',    // Purple
        'cancelled': '#f44336',     // Red
        'returned': '#4caf50'     // Green
    };
    return colors[status] || '#666';
}

function handleEventClick(info) {
    // Check if this is an availability event or rental event
    if (info.event.extendedProps.availabilityData) {
        const data = info.event.extendedProps.availabilityData;
        let message = `${data.item} Availability\\n\\nDate: ${info.event.startStr}\\nStatus: ${data.status}\\nAvailable: ${data.available}/${data.total}\\nBooked: ${data.booked}`;

        if (data.rentals.length > 0) {
            message += `\\n\\nBookings on this date:`;
            data.rentals.forEach((r, i) => {
                const timeStr = r.rent_time && r.return_time ? ` (${formatTime(r.rent_time)}-${formatTime(r.return_time)})` : '';
                message += `\\n${i + 1}. ${r.renter_name}: ${r.quantity} units${timeStr}`;
            });
        }

        Toast.info(message);
    } else {
        // Regular rental event
        const rental = info.event.extendedProps.rentalData;
        let message = `Rental Details:\\n\\nCustomer: ${rental.renter_name}\\nDates: ${rental.rent_date} to ${rental.return_date}`;

        if (rental.rent_time && rental.return_time) {
            message += `\\nTime: ${formatTime(rental.rent_time)} - ${formatTime(rental.return_time)}`;
        }

        message += `\\nStatus: ${rental.status}\\nPayment: ₱${rental.payment_amount}`;
        Toast.info(message);
    }
}

// Function to refresh calendar with latest data
async function refreshCalendar() {
    if (!calendar) return;

    const events = await fetchCalendarEvents();
    calendar.removeAllEvents();
    calendar.addEventSource(events);
}
