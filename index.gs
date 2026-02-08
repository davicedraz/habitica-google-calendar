/**
 * Habitica Google Calendar Sync
 *
 * Syncs today's Google Calendar events to Habitica as daily tasks.
 * Configure via Apps Script > Project Settings > Script Properties.
 *
 * @see https://github.com/davicedraz/habitica-google-calendar
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL for the Habitica tasks API. */
const HABITICA_API_BASE = "https://habitica.com/api/v3/tasks/";

/** Prefix added to every task created by this script (used to identify them). */
const CALENDAR_TASK_PREFIX = ":calendar: ";

/** Habitica task type used when creating calendar tasks. */
const TASK_TYPE = "daily";

/**
 * Habitica task priority.
 * 0.1 = trivial, 1 = easy, 1.5 = medium, 2 = hard.
 */
const TASK_PRIORITY = 2;

/** Placeholder values used to detect missing configuration. */
const DEFAULT_CONFIG = {
  CALENDAR_NAME: "Your calendar name goes here",
  HABITICA_TOKEN: "Your habitica token goes here",
  HABITICA_ID: "Your habitica id goes here",
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Reads today's events from Google Calendar and syncs them to Habitica.
 *
 * - Creates a Habitica daily for each unique event title.
 * - Deletes incomplete calendar tasks that are no longer on today's schedule.
 * - Preserves completed dailies so you never lose progress.
 *
 * Set up a time-driven trigger to call this function automatically.
 */
function syncToHabitica() {
  const config = getConfig_();
  const today = new Date();
  const agenda = getCalendarByName_(config.calendarName);
  const events = agenda.getEventsForDay(today);

  if (!events || events.length === 0) {
    Logger.log("No events found for today. Nothing to sync.");
    return;
  }

  Logger.log("Found %s event(s) for today.", events.length);

  const headers = buildHabiticaHeaders_(config);
  const allDailies = fetchDailyTasks_(headers);

  const completedTaskTexts = extractCompletedCalendarTaskTexts_(allDailies);

  deleteStaleCalendarTasks_(allDailies, headers, completedTaskTexts);

  let createdCount = 0;
  const seenTitles = new Set();

  for (let i = 0; i < events.length; i += 1) {
    const title = events[i].getTitle();

    if (!title || title.trim() === "") {
      Logger.log("Skipping event with empty title at index %s.", i);
      continue;
    }

    if (seenTitles.has(title)) {
      continue;
    }
    seenTitles.add(title);

    const payload = buildTaskPayload_(events[i]);
    if (!completedTaskTexts.has(payload.text)) {
      apiRequest_(HABITICA_API_BASE + "user", "post", headers, payload);
      createdCount += 1;
    }
  }

  Logger.log(
    "Sync complete. Created %s task(s), skipped %s duplicate(s).",
    createdCount,
    seenTitles.size - createdCount
  );
}

/**
 * Backwards-compatible alias for existing triggers.
 * An earlier version of this script had a typo in the function name.
 * @deprecated Use {@link syncToHabitica} instead.
 */
function syncToHabbitica() {
  syncToHabitica();
}

// ---------------------------------------------------------------------------
// Task helpers
// ---------------------------------------------------------------------------

/**
 * Builds a Habitica task payload from a Google Calendar event.
 *
 * @param {GoogleAppsScript.Calendar.CalendarEvent} event - The calendar event.
 * @returns {Object} A plain object ready to be sent to the Habitica API.
 */
function buildTaskPayload_(event) {
  const title = event.getTitle();
  return {
    text: CALENDAR_TASK_PREFIX + title,
    notes: createTaskNote(title, event.getLocation()),
    type: TASK_TYPE,
    priority: TASK_PRIORITY,
    date: "today",
    repeat: false,
  };
}

/**
 * Customizes the notes field for a calendar task.
 *
 * Override this function to attach rich Markdown notes or images to specific
 * events. The default implementation simply returns the event location.
 *
 * @param {string} title    - The event title.
 * @param {string} location - The event location (may be empty).
 * @returns {string} Markdown string used as the task's notes.
 *
 * @example
 * // Attach an image when the event title contains "Gym":
 * function createTaskNote(title, location) {
 *   if (title.includes("Gym")) {
 *     return (location || "") + "\n\n![Gym](https://example.com/gym.png)";
 *   }
 *   return location || "";
 * }
 */
function createTaskNote(title, location) {
  return location || "";
}

// ---------------------------------------------------------------------------
// Habitica API
// ---------------------------------------------------------------------------

/**
 * Fetches all daily tasks from Habitica for the authenticated user.
 *
 * @param {Object} headers - Habitica authentication headers.
 * @returns {Object} Parsed JSON response with a `data` array of daily tasks.
 */
function fetchDailyTasks_(headers) {
  const response = apiRequest_(
    HABITICA_API_BASE + "user?type=dailys",
    "get",
    headers
  );
  return JSON.parse(response.getContentText());
}

/**
 * Extracts the text of completed calendar tasks from a list of dailies.
 *
 * @param {Object} allDailies - The response from {@link fetchDailyTasks_}.
 * @returns {Set<string>} A set of task `text` values that are completed.
 */
function extractCompletedCalendarTaskTexts_(allDailies) {
  const completed = new Set();
  const tasks = allDailies.data || [];

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    if (task.text.startsWith(CALENDAR_TASK_PREFIX) && task.completed === true) {
      completed.add(task.text);
    }
  }
  return completed;
}

/**
 * Deletes incomplete calendar tasks that are no longer on today's schedule.
 *
 * Only tasks prefixed with {@link CALENDAR_TASK_PREFIX} are considered.
 * Completed tasks are always preserved.
 *
 * @param {Object}      allDailies         - The response from {@link fetchDailyTasks_}.
 * @param {Object}      headers            - Habitica authentication headers.
 * @param {Set<string>} completedTaskTexts - Texts of completed calendar tasks.
 */
function deleteStaleCalendarTasks_(allDailies, headers, completedTaskTexts) {
  const tasks = allDailies.data || [];
  let deletedCount = 0;

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    if (
      task.text.startsWith(CALENDAR_TASK_PREFIX) &&
      !completedTaskTexts.has(task.text)
    ) {
      apiRequest_(HABITICA_API_BASE + task.id, "delete", headers);
      deletedCount += 1;
    }
  }

  if (deletedCount > 0) {
    Logger.log("Deleted %s stale calendar task(s).", deletedCount);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Makes an authenticated request to the Habitica API.
 *
 * Wraps `UrlFetchApp.fetch` with error handling and logging so that
 * transient failures surface useful information instead of crashing silently.
 *
 * @param {string}  url     - The full API URL.
 * @param {string}  method  - HTTP method (get, post, delete, ...).
 * @param {Object}  headers - Habitica authentication headers.
 * @param {Object}  [payload] - Optional JSON body for POST/PUT requests.
 * @returns {GoogleAppsScript.URL_Fetch.HTTPResponse} The raw HTTP response.
 * @throws {Error} If the request fails or returns a non-2xx status code.
 */
function apiRequest_(url, method, headers, payload) {
  const options = { method: method, headers: headers, muteHttpExceptions: true };
  if (payload !== undefined) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }

  try {
    const response = UrlFetchApp.fetch(url, options);
    const status = response.getResponseCode();

    if (status < 200 || status >= 300) {
      Logger.log(
        "Habitica API error — %s %s returned %s: %s",
        method.toUpperCase(),
        url,
        status,
        response.getContentText()
      );
      throw new Error(
        "Habitica API request failed with status " + status + "."
      );
    }
    return response;
  } catch (error) {
    Logger.log("Request failed — %s %s: %s", method.toUpperCase(), url, error.message);
    throw error;
  }
}

/**
 * Builds the authentication headers required by the Habitica API.
 *
 * @param {Object} config - Configuration with `habiticaId` and `habiticaToken`.
 * @returns {Object} Headers object with `x-api-user` and `x-api-key`.
 */
function buildHabiticaHeaders_(config) {
  return {
    "x-api-user": config.habiticaId,
    "x-api-key": config.habiticaToken,
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Reads and validates configuration from Apps Script's Script Properties.
 *
 * @returns {{ calendarName: string, habiticaId: string, habiticaToken: string }}
 * @throws {Error} If any required property is missing or still has its placeholder value.
 */
function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  const calendarName =
    props.getProperty("CALENDAR_NAME") || DEFAULT_CONFIG.CALENDAR_NAME;
  const habiticaToken =
    props.getProperty("HABITICA_TOKEN") || DEFAULT_CONFIG.HABITICA_TOKEN;
  const habiticaId =
    props.getProperty("HABITICA_ID") || DEFAULT_CONFIG.HABITICA_ID;

  const missing = [];
  if (!calendarName || calendarName === DEFAULT_CONFIG.CALENDAR_NAME) {
    missing.push("CALENDAR_NAME");
  }
  if (!habiticaToken || habiticaToken === DEFAULT_CONFIG.HABITICA_TOKEN) {
    missing.push("HABITICA_TOKEN");
  }
  if (!habiticaId || habiticaId === DEFAULT_CONFIG.HABITICA_ID) {
    missing.push("HABITICA_ID");
  }
  if (missing.length > 0) {
    throw new Error(
      "Missing Script Properties: " +
        missing.join(", ") +
        ". Set them in Apps Script > Project Settings."
    );
  }

  return {
    calendarName: calendarName,
    habiticaToken: habiticaToken,
    habiticaId: habiticaId,
  };
}

/**
 * Returns the first Google Calendar that matches the given name.
 *
 * @param {string} calendarName - The name of the calendar to look up.
 * @returns {GoogleAppsScript.Calendar.Calendar} The matching calendar.
 * @throws {Error} If no calendar with that name is found.
 */
function getCalendarByName_(calendarName) {
  const calendars = CalendarApp.getCalendarsByName(calendarName);
  if (!calendars || calendars.length === 0) {
    throw new Error(
      "Calendar not found: \"" +
        calendarName +
        "\". Check CALENDAR_NAME in Script Properties."
    );
  }
  return calendars[0];
}
