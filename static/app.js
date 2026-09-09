import e from './e.js';

function formatEventDateTime(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const date = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const startStr = start.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endStr = end.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${date}, ${startStr} - ${endStr}`;
}

function getSourceClass(sourceName) {
  const lower = (sourceName || '').toLowerCase();
  if (lower.includes('pinewood')) return 'source-tag source-tag-pinewood';
  if (lower.includes('volleyball')) return 'source-tag source-tag-volleyball';
  if (lower.includes('soccer')) return 'source-tag source-tag-soccer';
  if (lower.includes('basketball')) return 'source-tag source-tag-basketball';
  if (lower.includes('school') || lower.includes('helios')) {
    return 'source-tag source-tag-school';
  }
  return 'source-tag source-tag-default';
}

let allEvents = [];
let debounceTimer = null;

function renderEvents(events) {
  if (!events || events.length === 0) {
    e('upcoming', {}, [
      [
        'tr',
        {},
        [
          [
            'td',
            { colspan: '4', class: 'uk-text-center uk-text-muted uk-padding' },
            'No upcoming events match the current filter.',
          ],
        ],
      ],
    ]);
    return;
  }

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.startTime) - new Date(b.startTime)
  );

  const rows = sortedEvents.map((event) => {
    const isSynced = Boolean(event.isSynced);
    const isDeleted = Boolean(event.isDeleted);
    const syncedAtStr = event.syncedAt
      ? ` at ${new Date(event.syncedAt).toLocaleTimeString()}`
      : '';
    const stableId = event.stableId || '';
    const shortStableId = stableId ? stableId.slice(0, 14) + '…' : '-';
    const contentHash = event.contentHash || '';
    const shortHash = contentHash ? contentHash.slice(0, 8) + '…' : '-';
    const rawId = event.id || '';
    const name = event.name || event.summary || 'Untitled Event';
    const description = event.description || '';
    const location = event.location || '-';
    const sourceName = event.sourceName || 'Default';
    const timeFormatted = formatEventDateTime(event.startTime, event.endTime);

    let syncMarker;
    let statusChip;
    if (isSynced) {
      syncMarker = [
        'span',
        {
          class: 'sync-marker sync-marker-synced',
          title: `Synced to Google Calendar${syncedAtStr}`,
        },
        [
          ['span', { class: 'sync-icon' }, '✓'],
          ' Synced',
        ],
      ];
      statusChip = [
        'span',
        {
          class: 'debug-chip debug-chip-synced',
          title: `Status: Synced to Google Calendar${syncedAtStr}`,
        },
        '✓ GCal Synced',
      ];
    } else if (isDeleted) {
      syncMarker = [
        'span',
        {
          class: 'sync-marker sync-marker-deleted',
          title: 'Deleted in Google Calendar (Tombstone Mode)',
        },
        [
          ['span', { class: 'sync-icon' }, '✕'],
          ' Deleted',
        ],
      ];
      statusChip = [
        'span',
        {
          class: 'debug-chip debug-chip-deleted',
          title: 'Status: Deleted in Google Calendar (Tombstone)',
        },
        '✕ Deleted in GCal',
      ];
    } else {
      syncMarker = [
        'span',
        {
          class: 'sync-marker sync-marker-unsynced',
          title: 'Local only (not synced to Google Calendar)',
        },
        [
          ['span', { class: 'sync-icon' }, '○'],
          ' Unsynced',
        ],
      ];
      statusChip = [
        'span',
        {
          class: 'debug-chip debug-chip-unsynced',
          title: 'Status: Local only (not configured for GCal sync)',
        },
        '○ Local only',
      ];
    }

    const debugBadges = [
      statusChip,
      [
        'span',
        { class: 'debug-chip', title: `Original ICS UID: ${rawId}` },
        `UID: ${rawId}`,
      ],
      [
        'span',
        {
          class: 'debug-chip debug-chip-gcal',
          title: `Stable Google Calendar ID: ${stableId}`,
        },
        `GCal ID: ${shortStableId}`,
      ],
      [
        'span',
        {
          class: 'debug-chip debug-chip-hash',
          title: `Content Hash: ${contentHash}`,
        },
        `Hash: ${shortHash}`,
      ],
    ];

    const eventDetails = [
      ['div', { class: 'event-title' }, name],
    ];
    if (description) {
      eventDetails.push(['div', { class: 'event-desc' }, description]);
    }
    eventDetails.push(['div', { class: 'event-debug-meta' }, debugBadges]);

    const sourceContent = [
      ['div', {}, [['span', { class: getSourceClass(sourceName) }, sourceName]]],
      ['div', { class: 'uk-margin-xsmall-top' }, [syncMarker]],
    ];

    return [
      'tr',
      {},
      [
        ['td', { class: 'event-time-cell' }, timeFormatted],
        ['td', {}, sourceContent],
        ['td', {}, eventDetails],
        ['td', { class: 'event-loc' }, location],
      ],
    ];
  });

  e('upcoming', {}, rows);
}

function updateStatusText(filteredList) {
  const statusText = e('status-text');
  if (!statusText) return;

  const currentList = filteredList || allEvents;
  const syncedCount = currentList.filter((x) => x.isSynced).length;
  const deletedCount = currentList.filter((x) => x.isDeleted).length;

  let summaryStr = '';
  if (currentList.length === allEvents.length) {
    summaryStr = `Total: ${allEvents.length} events (${syncedCount} synced`;
  } else {
    summaryStr = `Showing ${currentList.length} of ${allEvents.length} events (${syncedCount} synced`;
  }

  if (deletedCount > 0) {
    summaryStr += `, ${deletedCount} deleted`;
  }
  summaryStr += `) · Updated: ${new Date().toLocaleTimeString()}`;
  statusText.textContent = summaryStr;
}

function applyFilter() {
  const timeFilter = e('time-filter');
  const sourceSelect = e('source-select');
  const searchInput = e('search-input');
  const selectedTime = timeFilter ? timeFilter.value : 'upcoming';
  const selectedSource = sourceSelect ? sourceSelect.value : '';
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const now = new Date().getTime();

  const filtered = allEvents.filter((ev) => {
    // Time filter
    if (selectedTime === 'upcoming') {
      const eventEnd = new Date(ev.endTime).getTime();
      if (eventEnd < now) {
        return false;
      }
    } else if (selectedTime === 'past') {
      const eventEnd = new Date(ev.endTime).getTime();
      if (eventEnd >= now) {
        return false;
      }
    }

    if (selectedSource && (ev.sourceName || 'Default') !== selectedSource) {
      return false;
    }
    if (query) {
      const name = (ev.name || ev.summary || '').toLowerCase();
      const desc = (ev.description || '').toLowerCase();
      const loc = (ev.location || '').toLowerCase();
      const uid = (ev.id || '').toLowerCase();
      const stableId = (ev.stableId || '').toLowerCase();
      if (
        !name.includes(query) &&
        !desc.includes(query) &&
        !loc.includes(query) &&
        !uid.includes(query) &&
        !stableId.includes(query)
      ) {
        return false;
      }
    }
    return true;
  });

  renderEvents(filtered);
  updateStatusText(filtered);
}

function debouncedApplyFilter() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(applyFilter, 120);
}

function renderUserProfile(user) {
  const container = document.getElementById('user-profile');
  if (!container) return;

  const displayName = user.name || user.email;
  const avatar = user.picture
    ? `<img src="${user.picture}" alt="${displayName}" class="uk-border-circle" style="width: 24px; height: 24px; margin-right: 8px;" />`
    : `<span uk-icon="icon: user; ratio: 0.8" style="margin-right: 8px; color: #64748b;"></span>`;

  container.innerHTML = `
    <div class="user-profile-badge">
      ${avatar}
      <span class="user-email-text" title="${user.email}">${user.email}</span>
      <a href="/auth/logout" class="user-logout-btn" title="Sign Out">
        <span uk-icon="icon: sign-out; ratio: 0.8"></span>
      </a>
    </div>
  `;
}

async function loadCurrentUser() {
  try {
    const res = await fetch('/auth/me');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        renderUserProfile(data.user);
      }
    }
  } catch (err) {
    console.error('Failed to load current user:', err);
  }
}

async function loadEvents() {
  try {
    const [eventsRes, sourcesRes] = await Promise.all([
      fetch('/events'),
      fetch('/sources'),
    ]);

    if (eventsRes.status === 401 || sourcesRes.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!eventsRes.ok) {
      throw new Error(`Failed to fetch /events: ${eventsRes.statusText}`);
    }

    const json = await eventsRes.json();
    allEvents = json;
    applyFilter();

    if (sourcesRes.ok) {
      const sources = await sourcesRes.json();
      const sourceSelect = e('source-select');
      if (sourceSelect) {
        const currentVal = sourceSelect.value;
        sourceSelect.innerHTML =
          '<option value="">All Calendar Sources</option>' +
          sources
            .map(
              (s) =>
                `<option value="${s.name}">${s.name} (${s.eventsCount})</option>`
            )
            .join('');
        sourceSelect.value = currentVal;
      }
    }
  } catch (err) {
    console.error('Failed to load events:', err);
    const statusText = e('status-text');
    if (statusText) {
      statusText.textContent = `Error loading events: ${err.message}`;
    }
  }
}

async function syncEvents() {
  const syncBtn = e('sync');
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.innerHTML =
      '<span uk-icon="icon: refresh; ratio: 0.8" class="uk-margin-small-right"></span>Syncing...';
  }
  try {
    const res = await fetch('/sync');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    await loadEvents();
  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    if (syncBtn) {
      syncBtn.innerHTML =
        '<span uk-icon="icon: refresh; ratio: 0.8" class="uk-margin-small-right"></span>Sync Now';
      syncBtn.disabled = false;
    }
  }
}

function init() {
  const syncBtn = e('sync');
  if (syncBtn) {
    syncBtn.onclick = syncEvents;
  }
  const timeFilter = e('time-filter');
  if (timeFilter) {
    timeFilter.onchange = applyFilter;
  }
  const sourceSelect = e('source-select');
  if (sourceSelect) {
    sourceSelect.onchange = applyFilter;
  }
  const searchInput = e('search-input');
  if (searchInput) {
    searchInput.oninput = debouncedApplyFilter;
  }

  loadCurrentUser();
  loadEvents();
  setInterval(loadEvents, 30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
