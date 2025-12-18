import { supabase } from "./supabase.js";

const tbody = document.getElementById("archiveTableBody");
const emptyHint = document.getElementById("archiveEmptyHint");

async function loadArchive() {
    const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("archived", true)
        .order("name", { ascending: true });

    tbody.innerHTML = "";

    if (!data || data.length === 0) {
        emptyHint.style.display = "block";
        return;
    }

    emptyHint.style.display = "none";
    data.forEach(item => {
        tbody.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>${item.quantity_total}</td>
                <td>${item.status}</td>
                <td>
                    <button class="btn-restore" data-id="${item.id}">Restore</button>
                </td>
            </tr>
        `;
    });
}

tbody.addEventListener('click', async (e) => {
    const restoreBtn = e.target.closest('.btn-restore');
    if (restoreBtn) {
        const id = restoreBtn.getAttribute('data-id');
        await restoreItem(id);
    }
});

async function restoreItem(id) {
    const { error } = await supabase
        .from('inventory_items')
        .update({ archived: false })
        .eq('id', id);
    if (error) {
        alert('Failed to restore item. ' + (error.message || JSON.stringify(error)));
        return;
    }
    await loadArchive();
}

loadArchive();