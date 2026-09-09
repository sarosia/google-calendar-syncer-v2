const axios = require('axios');
const ical = require('node-ical');
const Event = require('./event');
const { DateTime, Duration } = require('@sarosia/datetime');
const { Hours } = Duration;

class IcsLoader {
  #timeoutMillis;

  constructor(options = {}) {
    this.#timeoutMillis = options.timeoutMillis || 10000;
  }

  async loadFromUrl(url, options = {}) {
    if (!url) {
      throw new Error('A valid ICS URL must be provided.');
    }
    let fetchUrl = String(url).trim();
    if (fetchUrl.startsWith('webcal://')) {
      fetchUrl = 'https://' + fetchUrl.slice('webcal://'.length);
    }
    const response = await axios.get(fetchUrl, {
      timeout: options.timeoutMillis || this.#timeoutMillis,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GoogleCalendarSyncer/2.0)',
        Accept: 'text/calendar, text/plain, */*',
        ...(options.headers || {}),
      },
      responseType: 'text',
    });

    const sourceName = options.sourceName || '';
    return this.parseIcs(response.data, sourceName);
  }

  async parseIcs(icsContent, sourceName = '') {
    if (!icsContent || typeof icsContent !== 'string') {
      throw new Error('ICS content must be a non-empty string.');
    }

    const parsedData = await ical.async.parseICS(icsContent);
    const events = [];

    for (const key of Object.keys(parsedData)) {
      const item = parsedData[key];
      if (item.type !== 'VEVENT') {
        continue;
      }

      const id = item.uid || item.id || key;
      const summary = item.summary ? String(item.summary).trim() : '';
      const description = item.description
        ? typeof item.description === 'string'
          ? item.description.trim()
          : item.description.val || ''
        : '';
      const location = item.location
        ? typeof item.location === 'string'
          ? item.location.trim()
          : item.location.val || ''
        : '';
      const status = item.status
        ? String(item.status).toUpperCase()
        : 'CONFIRMED';

      if (!item.start) {
        continue;
      }

      const startTime = new DateTime(item.start);
      let endTime;
      if (item.end && new DateTime(item.end).valueOf() > startTime.valueOf()) {
        endTime = new DateTime(item.end);
      } else {
        endTime = startTime.add(new Hours(1));
      }

      let recurrenceId = null;
      if (item.recurrenceid) {
        recurrenceId =
          item.recurrenceid instanceof Date
            ? item.recurrenceid.toISOString()
            : String(item.recurrenceid);
      } else if (item['recurrence-id']) {
        recurrenceId =
          item['recurrence-id'] instanceof Date
            ? item['recurrence-id'].toISOString()
            : String(item['recurrence-id']);
      }

      const event = new Event(
        id,
        startTime,
        endTime,
        summary,
        description,
        location,
        status,
        item,
        sourceName,
        recurrenceId
      );
      events.push(event);
    }

    events.sort(
      (a, b) => a.getStartTime().valueOf() - b.getStartTime().valueOf()
    );
    return events;
  }
}

module.exports = IcsLoader;
