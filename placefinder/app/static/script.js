const searchBox = document.getElementById("searchBox");
const searchBtn = document.getElementById("searchBtn");
const suggestions = document.getElementById("suggestions");
const clearBtn = document.getElementById("clearBtn");
const recentSearchesDiv = document.getElementById("recentSearches");
const loadingDiv = document.getElementById("loading");
const noResultsDiv = document.getElementById("noResults");
const exportBtn = document.getElementById("exportBtn");
const favoritesDiv = document.getElementById("favorites");
const mapContainer = document.getElementById("mapContainer");

let lastResults = [];
let selectedIdx = -1;

function saveRecentSearch(query) {
  let recents = JSON.parse(localStorage.getItem('recentSearches') || '[]');
  recents = recents.filter(q => q !== query);
  recents.unshift(query);
  if (recents.length > 5) recents = recents.slice(0, 5);
  localStorage.setItem('recentSearches', JSON.stringify(recents));
  renderRecentSearches();
}

function renderRecentSearches() {
  let recents = JSON.parse(localStorage.getItem('recentSearches') || '[]');
  if (recents.length === 0) {
    recentSearchesDiv.innerHTML = '';
    return;
  }
  recentSearchesDiv.innerHTML = '<div class="text-xs text-gray-500 mb-1">Recent:</div>' +
    recents.map(q => `<span class="relative group inline-block mr-2 mb-1"><button class="text-blue-500 underline text-xs recent-btn">${q}</button><button class="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full text-xs text-gray-500 px-1 opacity-0 group-hover:opacity-100 transition remove-recent-btn" title="Remove">&times;</button></span>`).join('');
  document.querySelectorAll('.recent-btn').forEach(btn => {
    btn.onclick = () => {
      searchBox.value = btn.textContent;
      searchBox.focus();
      // Do not trigger fetchResults automatically
    };
  });
  document.querySelectorAll('.remove-recent-btn').forEach((btn, idx) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      let recents = JSON.parse(localStorage.getItem('recentSearches') || '[]');
      recents.splice(idx, 1);
      localStorage.setItem('recentSearches', JSON.stringify(recents));
      renderRecentSearches();
    };
  });
}

function saveFavorite(item) {
  let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
  // Remove if already exists
  favs = favs.filter(f => f.postal_code !== item.postal_code);
  favs.push(item);
  // Enforce max 5, remove oldest
  if (favs.length > 5) favs = favs.slice(favs.length - 5);
  localStorage.setItem('favorites', JSON.stringify(favs));
  renderFavorites();
}

function removeFavorite(postal_code) {
  let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
  favs = favs.filter(f => f.postal_code !== postal_code);
  localStorage.setItem('favorites', JSON.stringify(favs));
  renderFavorites();
}

function renderFavorites() {
  let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
  if (favs.length === 0) {
    favoritesDiv.innerHTML = '';
    return;
  }
  favoritesDiv.innerHTML = '<div class="text-xs text-gray-500 mb-1">Favorites:</div>' +
    favs.map(f => `<span class="inline-block bg-yellow-100 text-yellow-800 rounded px-2 py-1 text-xs mr-2 mb-1 max-w-xs truncate" title="${f.name}">${f.name} <button class="remove-fav-btn text-red-500" data-postal="${f.postal_code}" aria-label="Remove favorite">&times;</button></span>`).join('');
  document.querySelectorAll('.remove-fav-btn').forEach(btn => {
    btn.onclick = () => removeFavoriteAPI(btn.getAttribute('data-postal'));
  });
}

function showLoading(show) {
  loadingDiv.classList.toggle('hidden', !show);
}

function showNoResults(show) {
  noResultsDiv.classList.toggle('hidden', !show);
}

function showMap(lat, lon) {
  if (!lat || !lon) {
    mapContainer.classList.add('hidden');
    mapContainer.innerHTML = '';
    return;
  }
  mapContainer.classList.remove('hidden');
  mapContainer.innerHTML = `<iframe width="100%" height="100%" frameborder="0" src="https://www.openstreetmap.org/export/embed.html?bbox=${lon-0.01}%2C${lat-0.01}%2C${lon+0.01}%2C${lat+0.01}&layer=mapnik&marker=${lat}%2C${lon}"></iframe>`;
}

async function fetchResults(query) {
  showLoading(true);
  showNoResults(false);
  suggestions.innerHTML = "";
  mapContainer.classList.add('hidden');
  selectedIdx = -1;
  try {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    lastResults = data;
    renderSuggestions(data);
    showNoResults(false);
    showLoading(false);
    // Do not save recent search here
  } catch (e) {
    showNoResults(true);
    showLoading(false);
  }
}

// --- Autocomplete feature ---
async function fetchAutocomplete(query) {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(`/autocomplete?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

let autocompleteBox;
function setupAutocomplete() {
  autocompleteBox = document.createElement('div');
  autocompleteBox.className = 'absolute bg-white border border-gray-300 rounded shadow-md z-10 w-full max-w-md';
  autocompleteBox.style.display = 'none';
  searchBox.parentNode.appendChild(autocompleteBox);

  searchBox.addEventListener('input', async (e) => {
    const val = searchBox.value.trim();
    if (val.length < 2) {
      autocompleteBox.style.display = 'none';
      return;
    }
    const suggestions = await fetchAutocomplete(val);
    if (suggestions.length === 0) {
      autocompleteBox.style.display = 'none';
      return;
    }
    autocompleteBox.innerHTML = suggestions.map(s => `<div class="px-4 py-2 cursor-pointer hover:bg-blue-100">${s}</div>`).join('');
    autocompleteBox.style.display = 'block';
    Array.from(autocompleteBox.children).forEach((child, idx) => {
      child.onclick = () => {
        searchBox.value = suggestions[idx];
        autocompleteBox.style.display = 'none';
        fetchResults(suggestions[idx]);
      };
    });
  });
  document.addEventListener('click', (e) => {
    if (!autocompleteBox.contains(e.target) && e.target !== searchBox) {
      autocompleteBox.style.display = 'none';
    }
  });
}

// --- Favorites API integration ---
async function syncFavorites() {
  try {
    const res = await fetch('/favorites');
    if (res.ok) {
      const favs = await res.json();
      localStorage.setItem('favorites', JSON.stringify(favs));
      renderFavorites();
    }
  } catch {}
}

async function addFavoriteAPI(item) {
  try {
    await fetch('/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    syncFavorites();
  } catch {}
}

async function removeFavoriteAPI(postal_code) {
  try {
    await fetch(`/favorites/${postal_code}`, { method: 'DELETE' });
    syncFavorites();
  } catch {}
}

// Patch favorite button events to use API
function renderFavorites() {
  let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
  if (favs.length === 0) {
    favoritesDiv.innerHTML = '';
    return;
  }
  favoritesDiv.innerHTML = '<div class="text-xs text-gray-500 mb-1">Favorites:</div>' +
    favs.map(f => `<span class="inline-block bg-yellow-100 text-yellow-800 rounded px-2 py-1 text-xs mr-2 mb-1 max-w-xs truncate" title="${f.name}">${f.name} <button class="remove-fav-btn text-red-500" data-postal="${f.postal_code}" aria-label="Remove favorite">&times;</button></span>`).join('');
  document.querySelectorAll('.remove-fav-btn').forEach(btn => {
    btn.onclick = () => removeFavoriteAPI(btn.getAttribute('data-postal'));
  });
}

// --- Recent search removable x button ---
function renderRecentSearches() {
  let recents = JSON.parse(localStorage.getItem('recentSearches') || '[]');
  if (recents.length === 0) {
    recentSearchesDiv.innerHTML = '';
    return;
  }
  recentSearchesDiv.innerHTML = '<div class="text-xs text-gray-500 mb-1">Recent:</div>' +
    recents.map(q => `<span class="relative group inline-block mr-2 mb-1"><button class="text-blue-500 underline text-xs recent-btn">${q}</button><button class="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full text-xs text-gray-500 px-1 opacity-0 group-hover:opacity-100 transition remove-recent-btn" title="Remove">&times;</button></span>`).join('');
  document.querySelectorAll('.recent-btn').forEach(btn => {
    btn.onclick = () => {
      searchBox.value = btn.textContent;
      searchBox.focus();
      // Do not trigger fetchResults automatically
    };
  });
  document.querySelectorAll('.remove-recent-btn').forEach((btn, idx) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      let recents = JSON.parse(localStorage.getItem('recentSearches') || '[]');
      recents.splice(idx, 1);
      localStorage.setItem('recentSearches', JSON.stringify(recents));
      renderRecentSearches();
    };
  });
}

// --- Truncate long place names and fix UI ---
function renderSuggestions(data) {
  suggestions.innerHTML = "";
  if (!Array.isArray(data) || data.length === 0) {
    showNoResults(true);
    showLoading(false);
    return;
  }
  data.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "bg-gray-100 border border-gray-300 rounded p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 focus:outline-none min-w-0";
    li.tabIndex = 0;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-label', `${item.name}, postal code ${item.postal_code}`);
    li.innerHTML = `
      <div class="min-w-0 max-w-xl">
        <div class="font-semibold truncate max-w-xs" title="${item.name}">${item.name}</div>
        <div class="text-sm text-gray-600">Postal Code: <span class="postal-code">${item.postal_code}</span></div>
        <div class="text-xs text-gray-500">District: ${item.district || "N/A"}</div>
      </div>
      <div class="flex gap-2 mt-2 md:mt-0 flex-shrink-0">
        <button class="copy-btn border-2 border-red-400 text-red-500 rounded-lg px-4 py-1 font-semibold hover:bg-red-50 transition focus:outline-none" data-postal="${item.postal_code}" data-name="${item.name}" data-district="${item.district || ''}" data-lat="${item.lat || ''}" data-lon="${item.lon || ''}" aria-label="Copy postal code">COPY</button>
        <button class="fav-btn border-2 border-yellow-400 text-yellow-600 rounded-lg px-4 py-1 font-semibold hover:bg-yellow-50 transition focus:outline-none" aria-label="Add to favorites">★</button>
        <button class="map-btn border-2 border-blue-400 text-blue-600 rounded-lg px-4 py-1 font-semibold hover:bg-blue-50 transition focus:outline-none" aria-label="Show on map" data-lat="${item.lat || ''}" data-lon="${item.lon || ''}">Map</button>
      </div>
    `;
    suggestions.appendChild(li);
  });
  // Copy
  document.querySelectorAll('.copy-btn').forEach((btn, idx) => {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      const code = this.getAttribute('data-postal').replace(/\D/g, '');
      try {
        await navigator.clipboard.writeText(code);
        const original = this.textContent;
        this.textContent = 'Copied!';
        setTimeout(() => { this.textContent = original; }, 1200);
        // Save recent search only when copied
        saveRecentSearch(this.getAttribute('data-name'));
      } catch (e) {
        alert('Failed to copy');
      }
    });
  });
  // Favorite
  document.querySelectorAll('.fav-btn').forEach((btn, idx) => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      addFavoriteAPI(data[idx]);
    });
  });
  // Map
  document.querySelectorAll('.map-btn').forEach((btn, idx) => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const lat = btn.getAttribute('data-lat');
      const lon = btn.getAttribute('data-lon');
      if (lat && lon) showMap(Number(lat), Number(lon));
    });
  });
  // Keyboard navigation
  document.querySelectorAll('#suggestions li').forEach((li, idx) => {
    li.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < data.length - 1) document.querySelectorAll('#suggestions li')[idx + 1].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) document.querySelectorAll('#suggestions li')[idx - 1].focus();
      } else if (e.key === 'Enter') {
        showMap(data[idx].lat, data[idx].lon);
      }
    });
  });
  showNoResults(false);
  showLoading(false);
}

// --- API docs link ---
function addApiDocsLink() {
  const apiDocs = document.createElement('a');
  apiDocs.href = '/docs';
  apiDocs.target = '_blank';
  apiDocs.className = 'block text-center text-blue-500 underline mt-4';
  apiDocs.textContent = 'API Documentation (Swagger)';
  document.querySelector('.max-w-md').appendChild(apiDocs);
}

async function init() {
  renderRecentSearches();
  renderFavorites();
  setupAutocomplete();
  syncFavorites();
  addApiDocsLink();
}

init();

searchBtn.addEventListener("click", () => {
  const query = searchBox.value.trim();
  if (query.length > 1) fetchResults(query);
});

searchBox.addEventListener("keydown", e => {
  // Allow all key events, including backspace, for smooth editing
  if (e.key === "Enter") {
    searchBtn.click();
  }
  // No auto-search on other keys
});

clearBtn.addEventListener('click', () => {
  searchBox.value = '';
  suggestions.innerHTML = '';
  mapContainer.classList.add('hidden');
  showNoResults(false);
  showLoading(false);
});

exportBtn.addEventListener('click', () => {
  if (!lastResults || lastResults.length === 0) return;
  const csv = [
    'Name,Postal Code,District,Latitude,Longitude',
    ...lastResults.map(r => `"${r.name}",${r.postal_code},"${r.district || ''}",${r.lat || ''},${r.lon || ''}`)
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'results.csv';
  a.click();
  URL.revokeObjectURL(url);
});
