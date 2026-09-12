import e from './e.js';
import {
  escapeHtml,
  formatDate,
  parseDateOnly,
  formatEventDateTime,
  formatTextWithLinks,
  linkifyTextNodes,
  shortenUrlText,
} from './apper-ui.js';

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

function formatContentWithLinks(rawContent) {
  if (!rawContent) return '';

  const hasHtml = /<[a-z][\s\S]*>/i.test(rawContent);

  if (hasHtml && typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      // Normalize line breaks & collapse 3+ consecutive line breaks
      const sanitizedInput = rawContent
        .replace(/<br\s*\/?>\s*[\r\n]+/gi, '<br>')
        .replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>');
      const doc = parser.parseFromString(sanitizedInput, 'text/html');

      // 1. Remove dangerous script/style/iframe tags
      const unsafe = doc.body.querySelectorAll(
        'script, style, iframe, frame, object, embed, applet, meta, link, base'
      );
      unsafe.forEach((el) => el.remove());

      // 2. Remove dangerous event handlers and protocols
      const allElements = doc.body.querySelectorAll('*');
      for (const el of allElements) {
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          const val = attr.value.toLowerCase().trim();
          if (
            name.startsWith('on') ||
            val.startsWith('javascript:') ||
            val.startsWith('data:')
          ) {
            el.removeAttribute(attr.name);
          }
        }
      }

      // 3. Process existing <a> tags: format & shorten link text
      const anchors = doc.body.querySelectorAll('a');
      for (const a of anchors) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.classList.add('event-link');
        const href = a.getAttribute('href') || '';
        if (href) {
          a.setAttribute('title', href);
        }
        // If anchor text contains or is a URL, shorten it
        const text = a.textContent.trim();
        if (/^https?:\/\//i.test(text) && text.length > 35) {
          a.textContent = shortenUrlText(text);
        }
      }

      // 4. Linkify any unlinked URLs in text nodes
      linkifyTextNodes(doc, doc.body);

      return doc.body.innerHTML;
    } catch (e) {
      console.warn('DOMParser error, falling back to text formatter:', e);
      return formatTextWithLinks(rawContent);
    }
  }

  // Pure plain text
  return formatTextWithLinks(rawContent);
}

let allEvents = [];
let debounceTimer = null;

function renderEvents(events) {
  if (!events || events.length === 0) {
    e('upcoming', {}, [
      [
        'tr',
        { class: 'empty-table-row' },
        [
          [
            'td',
            { colspan: '4', class: 'uk-text-center uk-text-muted uk-padding empty-table-cell' },
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
    const timeFormatted = formatEventDateTime(event);
    const hasLocation = location && location !== '-';

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
      eventDetails.push([
        'div',
        { class: 'event-desc' },
        formatContentWithLinks(description),
      ]);
    }
    eventDetails.push(['div', { class: 'event-debug-meta' }, debugBadges]);

    const sourceContent = [
      ['div', {}, [['span', { class: getSourceClass(sourceName) }, sourceName]]],
      ['div', { class: 'uk-margin-xsmall-top' }, [syncMarker]],
    ];

    const locDisplay = hasLocation
      ? [
          ['span', { class: 'loc-pin-icon' }, '📍 '],
          ['span', {}, formatContentWithLinks(location)],
        ]
      : location;

    return [
      'tr',
      { class: 'event-row' },
      [
        ['td', { class: 'event-time-cell', 'data-label': 'Time' }, timeFormatted],
        ['td', { class: 'event-source-cell', 'data-label': 'Source' }, sourceContent],
        ['td', { class: 'event-title-cell', 'data-label': 'Event' }, eventDetails],
        [
          'td',
          {
            class: hasLocation
              ? 'event-loc event-loc-cell'
              : 'event-loc event-loc-cell event-loc-empty',
            'data-label': 'Location',
          },
          locDisplay,
        ],
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
let allCalendars = [];

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

    const eventsBadge = e('badge-events-count');
    if (eventsBadge) {
      eventsBadge.textContent = allEvents.length;
    }

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

async function loadCalendars() {
  try {
    const res = await fetch('/calendars');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    allCalendars = await res.json();
    renderCalendars(allCalendars);
  } catch (err) {
    console.error('Failed to load calendars:', err);
    const container = e('calendars-list');
    if (container) {
      container.innerHTML = `
        <tr>
          <td colspan="6" class="uk-text-center uk-text-danger uk-padding">
            Failed to load calendars: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }
}

function renderCalendars(calendars) {
  const container = e('calendars-list');
  if (!container) return;

  const calBadge = e('badge-calendars-count');
  if (calBadge) {
    calBadge.textContent = (calendars || []).length;
  }

  if (!calendars || calendars.length === 0) {
    container.innerHTML = `
      <tr class="empty-table-row">
        <td colspan="6" class="uk-text-center uk-text-muted uk-padding empty-table-cell">
          No calendar subscriptions configured yet. Click <strong>"+ Add Calendar"</strong> to subscribe to your first feed.
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = '';
  for (const cal of calendars) {
    const tr = document.createElement('tr');
    tr.className = 'cal-row';

    // 1. Calendar Name & Strategy
    const nameTd = document.createElement('td');
    nameTd.className = 'cal-cell-name';
    nameTd.setAttribute('data-label', 'Calendar');
    const isTimeSummary = cal.idStrategy === 'time_summary';
    const stratClass = isTimeSummary
      ? 'cal-strat-badge cal-strat-time-summary'
      : 'cal-strat-badge cal-strat-standard';
    const stratIcon = isTimeSummary
      ? '<span uk-icon="icon: bolt; ratio: 0.7" class="uk-margin-xsmall-right"></span>'
      : '<span uk-icon="icon: tag; ratio: 0.7" class="uk-margin-xsmall-right"></span>';
    const stratLabel = isTimeSummary
      ? 'Time + Summary UID'
      : 'Standard UID';
    nameTd.innerHTML = `
      <div class="cal-name-text">${escapeHtml(cal.name)}</div>
      <div class="uk-margin-xsmall-top">
        <span class="${stratClass}" title="ID Strategy: ${escapeHtml(stratLabel)}">
          ${stratIcon}${stratLabel}
        </span>
      </div>
    `;
    tr.appendChild(nameTd);

    // 2. Feed URL
    const urlTd = document.createElement('td');
    urlTd.className = 'cal-cell-url';
    urlTd.setAttribute('data-label', 'Feed URL');
    const safeUrl = escapeHtml(cal.url);
    const shortUrl = safeUrl.length > 38 ? safeUrl.slice(0, 35) + '...' : safeUrl;
    urlTd.innerHTML = `
      <span class="cal-url-code" title="${safeUrl}">${shortUrl}</span>
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="uk-icon-link uk-margin-small-left cal-url-link" uk-icon="icon: link; ratio: 0.8" title="Open / test feed URL"></a>
    `;
    tr.appendChild(urlTd);

    // 3. Target Google Calendar
    const gcalTd = document.createElement('td');
    gcalTd.className = 'cal-cell-gcal';
    gcalTd.setAttribute('data-label', 'Target GCal');
    if (cal.targetCalendarId) {
      const displayName =
        cal.targetCalendarName ||
        (cal.targetCalendarId.length > 20
          ? cal.targetCalendarId.slice(0, 16) + '…'
          : cal.targetCalendarId);
      gcalTd.innerHTML = `
        <span class="cal-gcal-badge" title="ID: ${escapeHtml(cal.targetCalendarId)}">
          <span uk-icon="icon: google; ratio: 0.75" class="uk-margin-xsmall-right"></span>
          ${escapeHtml(displayName)}
        </span>
      `;
    } else {
      gcalTd.innerHTML = `<span class="cal-local-badge">Local only</span>`;
    }
    tr.appendChild(gcalTd);

    // 4. Active Filters
    const filterTd = document.createElement('td');
    filterTd.className = 'cal-cell-filter';
    filterTd.setAttribute('data-label', 'Filters');
    const filter = cal.filter || {};
    const pills = [];
    if (filter.pastWindow || filter.futureWindow) {
      pills.push(
        `<span class="filter-pill filter-pill-window"><span uk-icon="icon: calendar; ratio: 0.65" class="uk-margin-xsmall-right"></span>${escapeHtml(filter.pastWindow || '7d')} .. ${escapeHtml(filter.futureWindow || '90d')}</span>`
      );
    }
    if (filter.excludeCancelled !== false) {
      pills.push(`<span class="filter-pill filter-pill-cancelled"><span uk-icon="icon: check; ratio: 0.65" class="uk-margin-xsmall-right"></span>No cancelled</span>`);
    }
    if (filter.excludeSummaries && filter.excludeSummaries.length > 0) {
      pills.push(
        `<span class="filter-pill filter-pill-exclude"><span uk-icon="icon: close; ratio: 0.65" class="uk-margin-xsmall-right"></span>${filter.excludeSummaries.length} excluded</span>`
      );
    }
    if (filter.includeSummaries && filter.includeSummaries.length > 0) {
      pills.push(
        `<span class="filter-pill filter-pill-include"><span uk-icon="icon: plus; ratio: 0.65" class="uk-margin-xsmall-right"></span>${filter.includeSummaries.length} included</span>`
      );
    }
    filterTd.innerHTML = pills.length
      ? pills.join(' ')
      : `<span class="filter-pill filter-pill-default">Default filters</span>`;
    tr.appendChild(filterTd);

    // 5. Events count
    const countTd = document.createElement('td');
    countTd.className = 'cal-cell-count uk-text-center';
    countTd.setAttribute('data-label', 'Events');
    const countVal = cal.eventsCount || 0;
    const countClass = countVal > 0 ? 'cal-count-badge cal-count-active' : 'cal-count-badge cal-count-zero';
    countTd.innerHTML = `<span class="${countClass}">${countVal}</span>`;
    tr.appendChild(countTd);

    // 6. Actions (Edit & Delete)
    const actionsTd = document.createElement('td');
    actionsTd.className = 'cal-cell-actions uk-text-right';
    actionsTd.setAttribute('data-label', 'Actions');

    const editBtn = document.createElement('button');
    editBtn.className =
      'uk-button uk-button-default uk-button-small btn-cal-action';
    editBtn.innerHTML =
      '<span uk-icon="icon: file-edit; ratio: 0.8" class="uk-margin-xsmall-right"></span>Edit';
    editBtn.title = 'Edit calendar & filters';
    editBtn.onclick = () => openEditCalendarModal(cal);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'uk-button uk-button-danger uk-button-small btn-cal-action btn-cal-delete';
    deleteBtn.innerHTML = '<span uk-icon="icon: trash; ratio: 0.8" class="uk-margin-xsmall-right"></span>Delete';
    deleteBtn.title = 'Remove calendar subscription';
    deleteBtn.onclick = () => deleteCalendar(cal.id, cal.name);

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(deleteBtn);
    tr.appendChild(actionsTd);

    container.appendChild(tr);
  }
}

function openAddCalendarModal() {
  e('calendar-id').value = '';
  e('modal-calendar-title').textContent = 'Subscribe to Calendar';
  e('cal-name').value = '';
  e('cal-url').value = '';
  e('cal-target-id').value = '';
  e('cal-id-strategy').value = 'default';
  e('cal-past-window').value = '60d';
  e('cal-future-window').value = '365d';
  e('cal-exclude-cancelled').checked = true;
  e('cal-exclude-summaries').value = '';
  e('cal-include-summaries').value = '';

  const hint = e('cal-target-id-hint');
  if (hint) {
    hint.textContent =
      'Leave empty for local viewing only without syncing to Google Calendar.';
  }

  if (window.UIkit && window.UIkit.modal) {
    UIkit.modal('#modal-calendar').show();
  }
}

function openEditCalendarModal(cal) {
  e('calendar-id').value = cal.id;
  e('modal-calendar-title').textContent = `Edit Subscription: ${cal.name}`;
  e('cal-name').value = cal.name || '';
  e('cal-url').value = cal.url || '';
  e('cal-target-id').value = cal.targetCalendarId || '';
  e('cal-id-strategy').value = cal.idStrategy || 'default';

  const filter = cal.filter || {};
  e('cal-past-window').value = filter.pastWindow || '';
  e('cal-future-window').value = filter.futureWindow || '';
  e('cal-exclude-cancelled').checked = filter.excludeCancelled !== false;
  e('cal-exclude-summaries').value = (filter.excludeSummaries || []).join('\n');
  e('cal-include-summaries').value = (filter.includeSummaries || []).join('\n');

  const hint = e('cal-target-id-hint');
  if (hint) {
    if (cal.targetCalendarName) {
      hint.innerHTML = `Target calendar: <strong style="color: #7e22ce;">${escapeHtml(cal.targetCalendarName)}</strong>`;
    } else {
      hint.textContent =
        'Leave empty for local viewing only without syncing to Google Calendar.';
    }
  }

  if (window.UIkit && window.UIkit.modal) {
    UIkit.modal('#modal-calendar').show();
  }
}

async function submitCalendarForm(evt) {
  evt.preventDefault();
  const id = e('calendar-id').value;
  const name = e('cal-name').value.trim();
  const url = e('cal-url').value.trim();
  const targetCalendarId = e('cal-target-id').value.trim();
  const idStrategy = e('cal-id-strategy').value;

  const pastWindow = e('cal-past-window').value.trim();
  const futureWindow = e('cal-future-window').value.trim();
  const excludeCancelled = e('cal-exclude-cancelled').checked;
  const excludeSummaries = e('cal-exclude-summaries')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const includeSummaries = e('cal-include-summaries')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const saveBtn = e('btn-save-calendar');
  if (saveBtn) saveBtn.disabled = true;

  const payload = {
    name,
    url,
    targetCalendarId,
    idStrategy,
    filter: {
      pastWindow: pastWindow || undefined,
      futureWindow: futureWindow || undefined,
      excludeCancelled,
      excludeSummaries,
      includeSummaries,
    },
  };

  try {
    const endpoint = id
      ? `/calendars/${encodeURIComponent(id)}`
      : '/calendars';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }

    if (window.UIkit && window.UIkit.modal) {
      UIkit.modal('#modal-calendar').hide();
    }
    if (window.UIkit && window.UIkit.notification) {
      UIkit.notification({
        message: id
          ? 'Calendar updated in NotableDB!'
          : 'Calendar subscribed and saved in NotableDB!',
        status: 'success',
        pos: 'top-center',
        timeout: 3000,
      });
    }

    await Promise.all([loadCalendars(), loadEvents()]);
  } catch (err) {
    console.error('Failed to save calendar:', err);
    alert(`Error saving calendar: ${err.message}`);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function deleteCalendar(id, name) {
  const confirmed = confirm(
    `Are you sure you want to remove subscription "${name}"?\nThis will remove it from NotableDB storage.`
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`/calendars/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }

    if (window.UIkit && window.UIkit.notification) {
      UIkit.notification({
        message: `Subscription "${name}" removed from NotableDB.`,
        status: 'primary',
        pos: 'top-center',
        timeout: 3000,
      });
    }

    await Promise.all([loadCalendars(), loadEvents()]);
  } catch (err) {
    console.error('Failed to delete calendar:', err);
    alert(`Failed to remove calendar: ${err.message}`);
  }
}

function switchTab(target) {
  const eventsView = e('view-events');
  const calendarsView = e('view-calendars');
  const tabEventsLi = e('tab-events-li');
  const tabCalendarsLi = e('tab-calendars-li');

  if (target === 'calendars') {
    if (eventsView) eventsView.style.display = 'none';
    if (calendarsView) calendarsView.style.display = 'block';
    if (tabEventsLi) tabEventsLi.classList.remove('uk-active');
    if (tabCalendarsLi) tabCalendarsLi.classList.add('uk-active');
    loadCalendars();
  } else {
    if (calendarsView) calendarsView.style.display = 'none';
    if (eventsView) eventsView.style.display = 'block';
    if (tabCalendarsLi) tabCalendarsLi.classList.remove('uk-active');
    if (tabEventsLi) tabEventsLi.classList.add('uk-active');
    applyFilter();
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
    await Promise.all([loadEvents(), loadCalendars()]);
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

  // Navigation tab listeners
  const tabEvents = e('tab-events');
  if (tabEvents) {
    tabEvents.onclick = (e) => {
      e.preventDefault();
      switchTab('events');
    };
  }
  const tabCalendars = e('tab-calendars');
  if (tabCalendars) {
    tabCalendars.onclick = (e) => {
      e.preventDefault();
      switchTab('calendars');
    };
  }

  // Calendar management listeners
  const btnAddCal = e('btn-add-calendar');
  if (btnAddCal) {
    btnAddCal.onclick = openAddCalendarModal;
  }
  const btnRefreshCals = e('btn-refresh-calendars');
  if (btnRefreshCals) {
    btnRefreshCals.onclick = loadCalendars;
  }
  const formCal = e('form-calendar');
  if (formCal) {
    formCal.onsubmit = submitCalendarForm;
  }

  loadEvents();
  loadCalendars();
  setInterval(loadEvents, 30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

