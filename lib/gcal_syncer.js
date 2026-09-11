const { google } = require('googleapis');

class GCalSyncer {
  #calendar;
  #logger;
  #auth;
  #credentialPath;
  #tombstoneMode;
  #summaryCache = new Map();

  constructor(options = {}, logger = console) {
    this.#logger = logger;
    this.#credentialPath =
      options.credentialPath ||
      options.keyFilename ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      '/home/cmto/.google.cred.json';

    this.#tombstoneMode = options.tombstoneMode !== false;

    this.#auth = new google.auth.GoogleAuth({
      keyFilename: this.#credentialPath,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    this.#calendar = options.calendar || null;
  }

  getCredentialPath() {
    return this.#credentialPath;
  }

  isTombstoneMode() {
    return this.#tombstoneMode;
  }

  async getCalendarClient() {
    if (!this.#calendar) {
      const authClient = await this.#auth.getClient();
      this.#calendar = google.calendar({ version: 'v3', auth: authClient });
    }
    return this.#calendar;
  }

  async getCalendarSummary(calendarId) {
    if (!calendarId || typeof calendarId !== 'string') return null;
    const trimmedId = calendarId.trim();
    if (!trimmedId) return null;
    if (this.#summaryCache.has(trimmedId)) {
      return this.#summaryCache.get(trimmedId);
    }
    try {
      const cal = await this.getCalendarClient();
      if (!cal || !cal.calendars || typeof cal.calendars.get !== 'function') {
        return trimmedId;
      }
      const res = await cal.calendars.get({ calendarId: trimmedId });
      const summary =
        res && res.data && res.data.summary ? res.data.summary : trimmedId;
      this.#summaryCache.set(trimmedId, summary);
      return summary;
    } catch (err) {
      this.#logger.warn(
        `Failed to fetch Google Calendar summary for "${trimmedId}": ${err.message}`
      );
      return null;
    }
  }

  async syncSource(source, events) {
    const calendarId = source.getTargetCalendarId();
    const sourceName = source.getName();

    if (!calendarId) {
      this.#logger.info(
        `Skipping Google Calendar sync for "${sourceName}" (no targetCalendarId configured).`
      );
      return { skipped: true, reason: 'no_target_calendar_id' };
    }

    const cal = await this.getCalendarClient();
    this.#logger.info(
      `Syncing "${sourceName}" (${
        events.length
      } events) to Google Calendar "${calendarId}" (Tombstone Mode: ${
        this.#tombstoneMode ? 'Enabled' : 'Disabled'
      })...`
    );

    const existingGCalEvents = [];
    let pageToken = null;
    do {
      const res = await cal.events.list({
        calendarId,
        privateExtendedProperty: `syncerSource=${sourceName}`,
        showDeleted: true,
        pageToken,
        maxResults: 2500,
        singleEvents: true,
      });

      if (res.data && res.data.items) {
        existingGCalEvents.push(...res.data.items);
      }
      pageToken = res.data ? res.data.nextPageToken : null;
    } while (pageToken);

    this.#logger.info(
      `Found ${existingGCalEvents.length} existing events (including tombstones) in Google Calendar for "${sourceName}".`
    );

    const existingMap = new Map();
    for (const gEvent of existingGCalEvents) {
      existingMap.set(gEvent.id, gEvent);
    }

    const currentMap = new Map();
    for (const ev of events) {
      currentMap.set(ev.getStableId(), ev);
    }

    const stats = {
      added: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      tombstoned: 0,
      errors: [],
    };

    // 1. Identify additions and updates
    for (const [stableId, event] of currentMap.entries()) {
      const existing = existingMap.get(stableId);

      if (!existing) {
        try {
          const body = event.toGoogleCalendarEvent();
          await cal.events.insert({
            calendarId,
            requestBody: body,
          });
          stats.added++;
          event.setSynced(true);
          this.#logger.info(
            `[GCal ADDED] "${event.getSummary()}" (${event
              .getStartTime()
              .toString()})`
          );
        } catch (err) {
          if (
            err.code === 409 ||
            (err.message && err.message.includes('already exists'))
          ) {
            if (this.#tombstoneMode) {
              stats.tombstoned++;
              event.setSynced(false);
              event.setDeleted(true);
              this.#logger.info(
                `[GCal TOMBSTONE SKIPPED] "${event.getSummary()}" was deleted in Google Calendar; skipping re-creation.`
              );
            } else {
              try {
                const body = event.toGoogleCalendarEvent();
                await cal.events.patch({
                  calendarId,
                  eventId: stableId,
                  requestBody: body,
                });
                stats.added++;
                event.setSynced(true);
                this.#logger.info(
                  `[GCal RESTORED/ADDED] "${event.getSummary()}" (${event
                    .getStartTime()
                    .toString()})`
                );
              } catch (patchErr) {
                this.#logger.error(
                  `Failed to restore/update event "${event.getSummary()}" (${stableId}):`,
                  patchErr.message
                );
                stats.errors.push({
                  id: stableId,
                  action: 'patch_409',
                  error: patchErr.message,
                });
              }
            }
          } else {
            this.#logger.error(
              `Failed to insert event "${event.getSummary()}" (${stableId}):`,
              err.message
            );
            stats.errors.push({
              id: stableId,
              action: 'insert',
              error: err.message,
            });
          }
        }
      } else if (existing.status === 'cancelled') {
        if (this.#tombstoneMode) {
          stats.tombstoned++;
          event.setSynced(false);
          event.setDeleted(true);
        } else {
          try {
            const body = event.toGoogleCalendarEvent();
            await cal.events.patch({
              calendarId,
              eventId: stableId,
              requestBody: body,
            });
            stats.added++;
            event.setSynced(true);
            this.#logger.info(
              `[GCal RESTORED/ADDED] "${event.getSummary()}" (${event
                .getStartTime()
                .toString()})`
            );
          } catch (patchErr) {
            this.#logger.error(
              `Failed to restore event "${event.getSummary()}" (${stableId}):`,
              patchErr.message
            );
            stats.errors.push({
              id: stableId,
              action: 'restore_cancelled',
              error: patchErr.message,
            });
          }
        }
      } else {
        const storedHash = existing.extendedProperties?.private?.icsHash;
        const currentHash = event.getContentHash();

        if (storedHash !== currentHash) {
          try {
            const body = event.toGoogleCalendarEvent();
            await cal.events.patch({
              calendarId,
              eventId: stableId,
              requestBody: body,
            });
            stats.updated++;
            event.setSynced(true);
            this.#logger.info(
              `[GCal UPDATED] "${event.getSummary()}" (${event
                .getStartTime()
                .toString()})`
            );
          } catch (err) {
            this.#logger.error(
              `Failed to update event "${event.getSummary()}" (${stableId}):`,
              err.message
            );
            stats.errors.push({
              id: stableId,
              action: 'patch',
              error: err.message,
            });
          }
        } else {
          stats.unchanged++;
          event.setSynced(true);
        }
      }
    }

    // 2. Identify deletions
    for (const [stableId, gEvent] of existingMap.entries()) {
      if (gEvent.status !== 'cancelled' && !currentMap.has(stableId)) {
        try {
          await cal.events.delete({
            calendarId,
            eventId: stableId,
          });
          stats.deleted++;
          this.#logger.info(`[GCal DELETED] "${gEvent.summary}"`);
        } catch (err) {
          this.#logger.error(
            `Failed to delete event "${gEvent.summary}" (${stableId}):`,
            err.message
          );
          stats.errors.push({
            id: stableId,
            action: 'delete',
            error: err.message,
          });
        }
      }
    }

    this.#logger.info(
      `Sync complete for "${sourceName}": ${stats.added} added, ${
        stats.updated
      } updated, ${stats.deleted} deleted, ${stats.unchanged} unchanged${
        stats.tombstoned ? ', ' + stats.tombstoned + ' tombstone skipped' : ''
      }.`
    );

    return stats;
  }
}

module.exports = GCalSyncer;
