const { DateTime, Duration } = require('@sarosia/datetime');
const { parse: parseDuration, Hours, Duration: DurationClass } = Duration;

class EventFilter {
  #options;

  constructor(options = {}) {
    this.#options = {
      includeSummaries: options.includeSummaries || [],
      excludeSummaries: options.excludeSummaries || [],
      includeDescriptions: options.includeDescriptions || [],
      excludeDescriptions: options.excludeDescriptions || [],
      excludeCancelled: options.excludeCancelled !== false,
      minTime: options.minTime || null,
      maxTime: options.maxTime || null,
      pastWindow: options.pastWindow || null,
      futureWindow: options.futureWindow || null,
      predicates: options.predicates || [],
    };
  }

  static #matchesPattern(pattern, text) {
    if (!pattern || !text) return false;
    if (pattern instanceof RegExp) {
      return pattern.test(text);
    }
    const patternStr = String(pattern).trim();
    if (patternStr.startsWith('/') && patternStr.lastIndexOf('/') > 0) {
      const lastSlash = patternStr.lastIndexOf('/');
      const body = patternStr.slice(1, lastSlash);
      const flags = patternStr.slice(lastSlash + 1);
      try {
        return new RegExp(body, flags).test(text);
      } catch (e) {
        // Fallback to substring match
      }
    }
    if (patternStr.includes('\\b')) {
      try {
        return new RegExp(patternStr, 'i').test(text);
      } catch (e) {
        // Fallback to substring match
      }
    }
    return text.toLowerCase().includes(patternStr.toLowerCase());
  }

  static parseWindowDuration(window) {
    if (!window) return null;
    if (window instanceof DurationClass) {
      return window;
    }
    if (typeof window === 'string') {
      const match = window.match(/^([0-9]+)([a-zA-Z]+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        if (unit === 'd' || unit === 'day' || unit === 'days') {
          return new Hours(num * 24);
        }
        if (unit === 'w' || unit === 'week' || unit === 'weeks') {
          return new Hours(num * 24 * 7);
        }
      }
      return parseDuration(window);
    }
    return null;
  }

  matches(event, referenceTime = DateTime.now()) {
    if (!event) return false;

    // Filter cancelled events
    if (this.#options.excludeCancelled && event.getStatus() === 'CANCELLED') {
      return false;
    }

    const startTime = event.getStartTime();
    const endTime = event.getEndTime();

    // 1. Absolute minTime
    if (this.#options.minTime) {
      const minTime =
        this.#options.minTime instanceof DateTime
          ? this.#options.minTime
          : new DateTime(this.#options.minTime);
      if (endTime.valueOf() < minTime.valueOf()) {
        return false;
      }
    }

    // 2. Absolute maxTime
    if (this.#options.maxTime) {
      const maxTime =
        this.#options.maxTime instanceof DateTime
          ? this.#options.maxTime
          : new DateTime(this.#options.maxTime);
      if (startTime.valueOf() > maxTime.valueOf()) {
        return false;
      }
    }

    // 3. Relative pastWindow
    if (this.#options.pastWindow) {
      const pastDuration = EventFilter.parseWindowDuration(
        this.#options.pastWindow
      );
      if (pastDuration) {
        const minBound = referenceTime.sub(pastDuration);
        if (endTime.valueOf() < minBound.valueOf()) {
          return false;
        }
      }
    }

    // 4. Relative futureWindow
    if (this.#options.futureWindow) {
      const futureDuration = EventFilter.parseWindowDuration(
        this.#options.futureWindow
      );
      if (futureDuration) {
        const maxBound = referenceTime.add(futureDuration);
        if (startTime.valueOf() > maxBound.valueOf()) {
          return false;
        }
      }
    }

    const summary = event.getSummary();
    const rawSummary =
      typeof event.getRawSummary === 'function'
        ? event.getRawSummary()
        : summary;
    const description = event.getDescription();

    // Exclude Summaries
    for (const pattern of this.#options.excludeSummaries) {
      if (
        EventFilter.#matchesPattern(pattern, summary) ||
        EventFilter.#matchesPattern(pattern, rawSummary)
      ) {
        return false;
      }
    }

    // Include Summaries (if specified, must match at least one)
    if (this.#options.includeSummaries.length > 0) {
      const matched = this.#options.includeSummaries.some(
        (pattern) =>
          EventFilter.#matchesPattern(pattern, summary) ||
          EventFilter.#matchesPattern(pattern, rawSummary)
      );
      if (!matched) {
        return false;
      }
    }

    // Exclude Descriptions
    for (const pattern of this.#options.excludeDescriptions) {
      if (EventFilter.#matchesPattern(pattern, description)) {
        return false;
      }
    }

    // Include Descriptions (if specified, must match at least one)
    if (this.#options.includeDescriptions.length > 0) {
      const matched = this.#options.includeDescriptions.some((pattern) =>
        EventFilter.#matchesPattern(pattern, description)
      );
      if (!matched) {
        return false;
      }
    }

    // Custom Predicates
    for (const predicate of this.#options.predicates) {
      if (typeof predicate === 'function' && !predicate(event)) {
        return false;
      }
    }

    return true;
  }

  filter(events, referenceTime = DateTime.now()) {
    if (!Array.isArray(events)) {
      return [];
    }
    return events.filter((event) => this.matches(event, referenceTime));
  }
}

module.exports = EventFilter;
