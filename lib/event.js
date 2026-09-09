const crypto = require('crypto');
const { DateTime } = require('@sarosia/datetime');

class Event {
  #id;
  #startTime;
  #endTime;
  #summary;
  #rawSummary;
  #description;
  #rawLocation;
  #location;
  #status;
  #sourceName;
  #raw;
  #recurrenceId;
  #idStrategy = 'uid';
  #isSynced = false;
  #isDeleted = false;
  #syncedAt = null;

  constructor(
    id,
    startTime,
    endTime,
    summary = '',
    description = '',
    location = '',
    status = 'CONFIRMED',
    raw = {},
    sourceName = '',
    recurrenceId = null,
    idStrategy = 'uid'
  ) {
    this.#id = id;
    this.#startTime =
      startTime instanceof DateTime ? startTime : new DateTime(startTime);
    this.#endTime =
      endTime instanceof DateTime ? endTime : new DateTime(endTime);
    this.#rawSummary = summary ? String(summary).trim() : '';
    this.#summary = Event.cleanSummary(summary);
    this.#description = description || '';
    this.#location = location || '';
    this.#rawLocation = location || '';
    this.#status = status ? String(status).toUpperCase() : 'CONFIRMED';
    this.#raw = raw;
    this.#sourceName = sourceName || '';
    this.#recurrenceId = recurrenceId || null;
    this.#idStrategy = idStrategy || 'uid';
    this.#isSynced = false;
    this.#isDeleted = false;
    this.#syncedAt = null;
  }

  static cleanSummary(summary) {
    if (!summary) return '';
    let title = String(summary).trim();

    // Match leading time range or single time:
    // Examples: 8am-3pm, 8:15-11:30am, 4-6pm, 12:15-2:45pm, 10pm, 8:15am, 10-11am, 8:30-9:30am, 1:15-5pm
    const leadingTimePattern =
      /^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:[-–—~]|\bto\b)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\s*(?:[-–—:|~]+\s*|\s+)/i;

    while (leadingTimePattern.test(title)) {
      title = title.replace(leadingTimePattern, '').trim();
    }

    // Strip any leftover leading dashes/colons/separators
    title = title.replace(/^[-–—:|~]+\s*/, '').trim();

    return title || String(summary).trim();
  }

  static generateStableId(
    sourceName = '',
    uid = '',
    recurrenceId = '',
    extra = {}
  ) {
    let rawKey;
    const strategy = extra.idStrategy || 'uid';
    if (strategy === 'time_summary') {
      const startStr = extra.startTime
        ? typeof extra.startTime.toDate === 'function'
          ? extra.startTime.toDate().toISOString()
          : typeof extra.startTime.toISOString === 'function'
          ? extra.startTime.toISOString()
          : String(extra.startTime)
        : '';
      const endStr = extra.endTime
        ? typeof extra.endTime.toDate === 'function'
          ? extra.endTime.toDate().toISOString()
          : typeof extra.endTime.toISOString === 'function'
          ? extra.endTime.toISOString()
          : String(extra.endTime)
        : '';
      const summary = extra.summary || '';
      rawKey = `${sourceName || ''}:${startStr}:${endStr}:${summary}:${
        recurrenceId || ''
      }`;
    } else {
      rawKey = `${sourceName || ''}:${uid || ''}:${recurrenceId || ''}`;
    }
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  getId() {
    return this.#id;
  }

  getIcsUid() {
    return this.#id;
  }

  getRecurrenceId() {
    return this.#recurrenceId;
  }

  getIdStrategy() {
    return this.#idStrategy;
  }

  setIdStrategy(strategy) {
    this.#idStrategy = strategy || 'uid';
  }

  getStableId(sourceName = this.#sourceName) {
    return Event.generateStableId(sourceName, this.#id, this.#recurrenceId, {
      idStrategy: this.#idStrategy,
      startTime: this.#startTime,
      endTime: this.#endTime,
      summary: this.#summary,
    });
  }

  getContentHash() {
    const payload = JSON.stringify({
      summary: this.#summary,
      description: this.#description,
      location: this.#location,
      status: this.#status,
      startTime: this.#startTime.toDate().toISOString(),
      endTime: this.#endTime.toDate().toISOString(),
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  getStartTime() {
    return this.#startTime;
  }

  getEndTime() {
    return this.#endTime;
  }

  getName() {
    return this.#summary;
  }

  getSummary() {
    return this.#summary;
  }

  getRawSummary() {
    return this.#rawSummary;
  }

  getDescription() {
    return this.#description;
  }

  getLocation() {
    return this.#location;
  }

  getRawLocation() {
    return this.#rawLocation;
  }

  setLocation(location) {
    this.#location = location || '';
  }

  getStatus() {
    return this.#status;
  }

  getSourceName() {
    return this.#sourceName;
  }

  setSourceName(name) {
    this.#sourceName = name;
  }

  getRaw() {
    return this.#raw;
  }

  toString() {
    const src = this.#sourceName ? ` [${this.#sourceName}]` : '';
    return `${this.#startTime.toString()}: ${this.#summary}${src}`;
  }

  isSynced() {
    return this.#isSynced;
  }

  isDeleted() {
    return this.#isDeleted;
  }

  getSyncedAt() {
    return this.#syncedAt;
  }

  setDeleted(deleted = true) {
    this.#isDeleted = Boolean(deleted);
    if (this.#isDeleted) {
      this.#isSynced = false;
    }
  }

  setSynced(synced = true, syncedAt = new Date()) {
    this.#isSynced = Boolean(synced);
    if (this.#isSynced) {
      this.#isDeleted = false;
    }
    this.#syncedAt = synced
      ? syncedAt instanceof Date
        ? syncedAt
        : new Date(syncedAt)
      : null;
  }

  toJson() {
    return {
      id: this.#id,
      stableId: this.getStableId(),
      idStrategy: this.#idStrategy,
      contentHash: this.getContentHash(),
      recurrenceId: this.#recurrenceId,
      summary: this.#summary,
      rawSummary: this.#rawSummary,
      name: this.#summary,
      description: this.#description,
      location: this.#location,
      rawLocation: this.#rawLocation,
      status: this.#status,
      sourceName: this.#sourceName,
      startTime: this.#startTime.toString(),
      endTime: this.#endTime.toString(),
      isSynced: this.#isSynced,
      isDeleted: this.#isDeleted,
      syncedAt: this.#syncedAt ? this.#syncedAt.toISOString() : null,
    };
  }

  toGoogleCalendarEvent() {
    const gcalEvent = {
      id: this.getStableId(),
      summary: this.#summary,
      description: this.#description,
      location: this.#location,
      status: this.#status.toLowerCase(),
      start: {
        dateTime: this.#startTime.toDate().toISOString(),
      },
      end: {
        dateTime: this.#endTime.toDate().toISOString(),
      },
      extendedProperties: {
        private: {
          syncerSource: this.#sourceName,
          icsUid: this.#id,
          icsHash: this.getContentHash(),
          idStrategy: this.#idStrategy,
        },
      },
    };

    if (this.#recurrenceId) {
      gcalEvent.extendedProperties.private.recurrenceId = this.#recurrenceId;
    }

    return gcalEvent;
  }
}

module.exports = Event;
