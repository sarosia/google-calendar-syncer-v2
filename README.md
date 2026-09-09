# google-calendar-syncer-v2

Fetch calendar ICS feeds, filter events according to individual or global rules, and synchronize to Google Calendar.

## Configuration with Per-Source Filtering

Create a `.calendersyncerrc` configuration in your working directory or in your `$HOME` directory:

```json
{
  "port": 3001,
  "syncFrequency": "15m",
  "defaultFilter": {
    "excludeCancelled": true,
    "futureWindow": "90d",
    "pastWindow": "7d"
  },
  "calendars": [
    {
      "name": "Work",
      "url": "https://work.example.com/calendar.ics",
      "filter": {
        "excludeSummaries": ["Private", "Focus Time"],
        "futureWindow": "30d"
      }
    },
    {
      "name": "School",
      "url": "https://school.example.com/calendar.ics",
      "filter": {
        "includeSummaries": ["Exam", "Lecture", "Lab"],
        "excludeSummaries": ["Optional"]
      }
    },
    {
      "name": "Personal",
      "url": "https://personal.example.com/feed.ics"
    }
  ]
}
```

## Running the Application

```bash
npm start
```

Open `http://localhost:3001` in your browser to view the web dashboard with filtered events and per-source breakdown.

## Running Tests

```bash
npm test
```
