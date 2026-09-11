const path = require('path');
const os = require('os');
const { Database, FilesystemStorage, Client } = require('@sarosia/notabledb');

class CalendarStore {
  #database;
  #defaultFilter;

  constructor(options = {}) {
    this.#defaultFilter = options.defaultFilter || {};

    if (options.database) {
      this.#database = options.database;
    } else if (options.url || options.notabledbUrl) {
      this.#database = new Client(options.url || options.notabledbUrl);
    } else {
      let dbPath =
        options.storagePath || options.dbPath || options.notabledbPath;
      if (!dbPath) {
        dbPath = path.join(os.homedir(), '.calendersyncer', 'notabledb.json');
      } else if (dbPath === '~') {
        dbPath = os.homedir();
      } else if (dbPath.startsWith('~/') || dbPath.startsWith('~\\')) {
        dbPath = path.join(os.homedir(), dbPath.slice(2));
      }
      const storage = new FilesystemStorage(path.resolve(dbPath));
      this.#database = new Database(storage);
    }
  }

  getDatabase() {
    return this.#database;
  }

  /**
   * Seed calendars from config if database doesn't have any calendars yet.
   * @param {Array} initialCalendars
   */
  async init(initialCalendars = []) {
    const existing = await this.listCalendars();
    if (
      existing.length === 0 &&
      initialCalendars &&
      initialCalendars.length > 0
    ) {
      const calendarsMap = {};
      for (const cal of initialCalendars) {
        const id = cal.id || this.#generateId(cal.name);
        calendarsMap[id] = {
          id,
          name: cal.name || 'Untitled Calendar',
          url: cal.url || '',
          targetCalendarId: cal.targetCalendarId || '',
          idStrategy: cal.idStrategy || 'default',
          filter: cal.filter || { ...this.#defaultFilter },
        };
      }
      await this.#database.update(['calendars'], calendarsMap);
    }
  }

  #generateId(name = '') {
    const slug = (name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
    const rand = Math.random().toString(36).slice(2, 8);
    return slug ? `${slug}-${rand}` : `cal-${Date.now()}-${rand}`;
  }

  async listCalendars() {
    const data = await this.#database.query(['calendars']);
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.map((c) => ({
        ...c,
        id: c.id || this.#generateId(c.name),
      }));
    }
    return Object.values(data);
  }

  async getCalendar(id) {
    if (!id) return null;
    const cal = await this.#database.query(['calendars', id]);
    if (cal) return cal;
    const all = await this.listCalendars();
    return all.find((c) => c.id === id) || null;
  }

  async addCalendar(calendarData) {
    if (!calendarData || !calendarData.name) {
      throw new Error('Calendar name is required.');
    }
    if (!calendarData.url) {
      throw new Error('Calendar URL is required.');
    }

    const id = calendarData.id || this.#generateId(calendarData.name);
    const newCalendar = {
      id,
      name: calendarData.name.trim(),
      url: calendarData.url.trim(),
      targetCalendarId: (calendarData.targetCalendarId || '').trim(),
      targetCalendarName: (calendarData.targetCalendarName || '').trim(),
      idStrategy: calendarData.idStrategy || 'default',
      filter: calendarData.filter || { ...this.#defaultFilter },
    };

    const existing = await this.#database.query(['calendars']);
    let calendarsMap = {};
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      calendarsMap = { ...existing };
    } else if (Array.isArray(existing)) {
      for (const item of existing) {
        if (item && item.id) calendarsMap[item.id] = item;
      }
    }

    calendarsMap[id] = newCalendar;
    await this.#database.update(['calendars'], calendarsMap);
    return newCalendar;
  }

  async updateCalendar(id, updates = {}) {
    if (!id) {
      throw new Error('Calendar ID is required.');
    }
    const existing = await this.getCalendar(id);
    if (!existing) {
      throw new Error(`Calendar with ID "${id}" not found.`);
    }

    const updated = {
      ...existing,
      ...updates,
      id,
      filter: {
        ...(existing.filter || {}),
        ...(updates.filter || {}),
      },
    };

    if (updates.name !== undefined) updated.name = updates.name.trim();
    if (updates.url !== undefined) updated.url = updates.url.trim();
    if (updates.targetCalendarId !== undefined) {
      updated.targetCalendarId = updates.targetCalendarId.trim();
    }
    if (updates.targetCalendarName !== undefined) {
      updated.targetCalendarName = updates.targetCalendarName.trim();
    }
    if (updates.idStrategy !== undefined) {
      updated.idStrategy = updates.idStrategy;
    }

    const allData = await this.#database.query(['calendars']);
    let calendarsMap = {};
    if (allData && typeof allData === 'object' && !Array.isArray(allData)) {
      calendarsMap = { ...allData };
    } else if (Array.isArray(allData)) {
      for (const item of allData) {
        if (item && item.id) calendarsMap[item.id] = item;
      }
    }
    calendarsMap[id] = updated;
    await this.#database.update(['calendars'], calendarsMap);
    return updated;
  }

  async removeCalendar(id) {
    if (!id) {
      throw new Error('Calendar ID is required.');
    }
    const existing = await this.getCalendar(id);
    if (!existing) {
      throw new Error(`Calendar with ID "${id}" not found.`);
    }

    const allData = await this.#database.query(['calendars']);
    if (allData && typeof allData === 'object' && !Array.isArray(allData)) {
      const copy = { ...allData };
      delete copy[id];
      await this.#database.update(['calendars'], copy);
    } else if (Array.isArray(allData)) {
      const filtered = allData.filter((c) => c.id !== id);
      await this.#database.update(['calendars'], filtered);
    } else {
      await this.#database.remove(['calendars', id]);
    }
    return existing;
  }
}

module.exports = CalendarStore;
