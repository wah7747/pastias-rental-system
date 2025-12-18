
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

function getStatusColor(status) {
    const colors = {
        'active': '#2196F3',      // Blue
        'reserved': '#9C27B0',    // Purple
        'overdue': '#f44336',     // Red
        'returned': '#4caf50'     // Green
    };
    return colors[status] || '#666';
}

function handleEventClick(info) {
    const rental = info.event.extendedProps.rentalData;
    const message = `Rental Details:\n\nCustomer: ${rental.renter_name}\nDates: ${rental.rent_date} to ${rental.return_date}\nStatus: ${rental.status}\nPayment: ₱${rental.payment_amount}`;
    alert(message);
    // TODO: Open existing rental modal with data for editing
}
