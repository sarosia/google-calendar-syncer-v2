const IcsLoader = require('./ics_loader');
const CalendarSource = require('./calendar_source');
const GCalSyncer = require('./gcal_syncer');
const { Duration } = require('@sarosia/datetime');
const { parse: parseDuration, sleep, Duration: DurationClass } = Duration;

class CalendarSyncer {
  #config;
  #logger;
  #loader;
  #gcalSyncer;
  #calendarStore;
  #sources = [];
  #events = [];

  constructor(
    config = {},
    logger = console,
    gcalSyncer = null,
    calendarStore = null
  ) {
    this.#config = config;
    this.#logger = logger;
    this.#calendarStore = calendarStore;
    this.#loader = new IcsLoader({
      timeoutMillis: config.timeoutMillis || 10000,
    });
    this.#gcalSyncer =
      gcalSyncer ||
      new GCalSyncer(
        {
          credentialPath: config.credentialPath,
        },
        logger
      );

    const defaultFilter = config.defaultFilter || config.filter || {};
    if (!this.#calendarStore) {
      const calendars =
        config.calendars ||
        config.calendarUrls ||
        (config.calendarUrl ? [config.calendarUrl] : []);

      for (const cal of calendars) {
        const source = new CalendarSource(cal, defaultFilter);
        this.#sources.push(source);
      }
    }
  }

  setCalendarStore(store) {
    this.#calendarStore = store;
  }

  getCalendarStore() {
    return this.#calendarStore;
  }

  reloadSources(calendars) {
    const defaultFilter =
      this.#config.defaultFilter || this.#config.filter || {};
    this.#sources = (calendars || []).map(
      (cal) => new CalendarSource(cal, defaultFilter)
    );
    return this.#sources;
  }

  async reloadSourcesFromStore() {
    if (!this.#calendarStore) return this.#sources;
    const calendars = await this.#calendarStore.listCalendars();
    return this.reloadSources(calendars);
  }

  getSources() {
    return this.#sources;
  }

  getLoader() {
    return this.#loader;
  }

  getGCalSyncer() {
    return this.#gcalSyncer;
  }

  async getCalendarSummary(calendarId) {
    if (!this.#gcalSyncer) return null;
    return this.#gcalSyncer.getCalendarSummary(calendarId);
  }

  getEvents() {
    return this.#events.concat();
  }

  async fetchAndFilter() {
    if (this.#calendarStore) {
      await this.reloadSourcesFromStore();
    }
    if (this.#sources.length === 0) {
      this.#logger.warn('No calendar sources configured for syncer.');
      this.#events = [];
      return [];
    }

    const allFilteredEvents = [];

    for (const source of this.#sources) {
      const url = source.getUrl();
      const name = source.getName();
      if (!url) {
        this.#logger.warn(
          `Skipping calendar source "${name}" (no URL provided).`
        );
        continue;
      }

      try {
        this.#logger.info(`Fetching ICS for "${name}" from ${url}...`);
        const rawEvents = await this.#loader.loadFromUrl(url, {
          sourceName: name,
        });
        this.#logger.info(
          `Loaded ${rawEvents.length} raw events for "${name}". Applying source filters...`
        );
        const filtered = source.filterEvents(rawEvents);
        this.#logger.info(
          `Source "${name}" yielded ${filtered.length} matching events.`
        );
        allFilteredEvents.push(...filtered);
      } catch (err) {
        this.#logger.error(
          `Error loading calendar source "${name}" (${url}):`,
          err
        );
      }
    }

    allFilteredEvents.sort(
      (a, b) => a.getStartTime().valueOf() - b.getStartTime().valueOf()
    );
    this.#events = allFilteredEvents;

    // Sync to Google Calendar for sources that have a targetCalendarId configured
    for (const source of this.#sources) {
      const name = source.getName();
      const filtered = source.getEvents();
      if (source.getTargetCalendarId()) {
        try {
          await this.#gcalSyncer.syncSource(source, filtered);
        } catch (syncErr) {
          this.#logger.error(
            `Error syncing "${name}" to Google Calendar:`,
            syncErr
          );
        }
      }
    }

    return this.#events;
  }

  async startPolling() {
    const syncFrequencyStr = this.#config.syncFrequency || '15m';
    const frequency =
      syncFrequencyStr instanceof DurationClass
        ? syncFrequencyStr
        : parseDuration(syncFrequencyStr);
    this.#logger.info(
      `Starting sync loop with frequency: ${frequency.toString()}`
    );

    while (true) {
      try {
        await this.fetchAndFilter();
      } catch (e) {
        this.#logger.error('Error during calendar sync cycle:', e);
      }
      await sleep(frequency);
    }
  }
}

module.exports = CalendarSyncer;
