const Apper = require('@sarosia/apper');
const NotableStore = Apper.NotableStore;

class CalendarStore extends NotableStore {
  #defaultFilter;

  constructor(options = {}) {
    super('calendars', {
      appName: 'calendersyncer',
      idField: 'id',
      ...options,
    });
    this.#defaultFilter = options.defaultFilter || {};
  }

  generateId(item = {}) {
    const name = item.name || '';
    const slug = (name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
    const rand = Math.random().toString(36).slice(2, 8);
    return slug ? `${slug}-${rand}` : `cal-${Date.now()}-${rand}`;
  }

  /**
   * Seed calendars from config if database doesn't have any calendars yet.
   * @param {Array} initialCalendars
   */
  async init(initialCalendars = []) {
    const formatted = (initialCalendars || [])
      .map((cal) => {
        if (!cal) return null;
        const id = cal.id || this.generateId(cal);
        return {
          id,
          name: cal.name || 'Untitled Calendar',
          url: cal.url || '',
          targetCalendarId: cal.targetCalendarId || '',
          idStrategy: cal.idStrategy || 'default',
          filter: cal.filter || { ...this.#defaultFilter },
        };
      })
      .filter(Boolean);
    await super.init(formatted);
  }

  async listCalendars() {
    return this.list();
  }

  async getCalendar(id) {
    return this.get(id);
  }

  async addCalendar(calendarData) {
    if (!calendarData || !calendarData.name) {
      throw new Error('Calendar name is required.');
    }
    if (!calendarData.url) {
      throw new Error('Calendar URL is required.');
    }

    const id = calendarData.id || this.generateId(calendarData);
    const newCalendar = {
      id,
      name: calendarData.name.trim(),
      url: calendarData.url.trim(),
      targetCalendarId: (calendarData.targetCalendarId || '').trim(),
      targetCalendarName: (calendarData.targetCalendarName || '').trim(),
      idStrategy: calendarData.idStrategy || 'default',
      filter: calendarData.filter || { ...this.#defaultFilter },
    };

    return super.add(newCalendar);
  }

  async updateCalendar(id, updates = {}) {
    if (!id) {
      throw new Error('Calendar ID is required.');
    }
    const existing = await this.getCalendar(id);
    if (!existing) {
      throw new Error(`Calendar with ID "${id}" not found.`);
    }

    const cleanUpdates = {
      filter: {
        ...(existing.filter || {}),
        ...(updates.filter || {}),
      },
    };

    if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
    if (updates.url !== undefined) cleanUpdates.url = updates.url.trim();
    if (updates.targetCalendarId !== undefined) {
      cleanUpdates.targetCalendarId = updates.targetCalendarId.trim();
    }
    if (updates.targetCalendarName !== undefined) {
      cleanUpdates.targetCalendarName = updates.targetCalendarName.trim();
    }
    if (updates.idStrategy !== undefined) {
      cleanUpdates.idStrategy = updates.idStrategy;
    }

    return super.update(id, cleanUpdates);
  }

  async removeCalendar(id) {
    if (!id) {
      throw new Error('Calendar ID is required.');
    }
    const existing = await this.getCalendar(id);
    if (!existing) {
      throw new Error(`Calendar with ID "${id}" not found.`);
    }
    return super.remove(id);
  }
}

module.exports = CalendarStore;
