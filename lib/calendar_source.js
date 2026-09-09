const EventFilter = require('./filter');

class CalendarSource {
  #name;
  #url;
  #filter;
  #targetCalendarId;
  #idStrategy;
  #events = [];

  constructor(sourceConfig = {}, defaultFilterConfig = {}) {
    if (typeof sourceConfig === 'string') {
      this.#url = sourceConfig;
      this.#name = sourceConfig;
      this.#filter = new EventFilter(defaultFilterConfig);
      this.#targetCalendarId = null;
      this.#idStrategy =
        this.#url && this.#url.includes('byga.net') ? 'time_summary' : 'uid';
    } else {
      this.#url = sourceConfig.url;
      this.#name = sourceConfig.name || sourceConfig.url || 'Default';
      this.#targetCalendarId = sourceConfig.targetCalendarId || null;
      this.#idStrategy =
        sourceConfig.idStrategy ||
        (sourceConfig.url && sourceConfig.url.includes('byga.net')
          ? 'time_summary'
          : 'uid');

      // Merge default filter with source-specific filter overrides
      const mergedFilterOptions = {
        ...defaultFilterConfig,
        ...(sourceConfig.filter || {}),
      };
      this.#filter = new EventFilter(mergedFilterOptions);
    }
  }

  getName() {
    return this.#name;
  }

  getUrl() {
    return this.#url;
  }

  getFilter() {
    return this.#filter;
  }

  getIdStrategy() {
    return this.#idStrategy;
  }

  getTargetCalendarId() {
    return this.#targetCalendarId;
  }

  getEvents() {
    return this.#events.concat();
  }

  setEvents(events) {
    this.#events = events.concat();
  }

  filterEvents(rawEvents) {
    for (const ev of rawEvents) {
      if (!ev.getSourceName()) {
        ev.setSourceName(this.#name);
      }
      if (this.#idStrategy) {
        ev.setIdStrategy(this.#idStrategy);
      }
    }
    const filtered = this.#filter.filter(rawEvents);
    this.#events = filtered;
    return filtered;
  }
}

module.exports = CalendarSource;
