// Tidely's version history, shown to users in the "What's new" window (the 🕘 button
// at the bottom of every page).
//
// RULE: every change that users can see or feel gets an entry here, in the same commit.
//   1. Add a new object at the TOP of this list (newest first).
//   2. Bump "version" in package.json to match (test/changelog.test.js checks this).
//   3. Write for a boater, not a programmer: what changed and why it helps them.
// Version numbers: first number for a redesign, second for new features, third for fixes.
// Each change has a kind: 'new' (something added), 'improved' (something changed or
// made better), or 'fixed' (something that was wrong).

export const CHANGELOG = [
  {
    version: '1.15.0',
    date: '2026-11-26',
    title: 'Version history',
    changes: [
      { kind: 'new', text: 'This window. Tap the 🕘 button at the bottom of any page to see what has changed in Tidely, version by version. A dot on the button tells you when there is something new since you last looked.' },
    ],
  },
  {
    version: '1.14.0',
    date: '2026-11-26',
    title: 'A visual redesign: instruments in place of text',
    changes: [
      { kind: 'new', text: 'Tide dial: one arc from low water to high water with a marker for the height of tide now, flood or ebb, and the next low and high water with countdowns.' },
      { kind: 'new', text: 'Instruments for conditions: a wind compass, sea and air temperature, a barometer with a rising or falling arrow, a daylight bar, and the moon drawn at its true phase.' },
      { kind: 'improved', text: 'Warnings for coastal flooding, surge and large ranges now sit on the picture as badges you can tap, and the flood-stage mark is drawn on the tide pole.' },
      { kind: 'improved', text: 'Week is now a tide curve for each day, with night shaded. The full table is one tap away and is what prints.' },
      { kind: 'improved', text: 'Plan is now a timeline: drag a line on the tide curve to set a height, and each day shows its usable windows as bars.' },
      { kind: 'improved', text: 'Currents shows a compass dial for set and drift, and a flood and ebb curve for the next 24 hours.' },
      { kind: 'improved', text: 'History is a single scale from the lowest to the highest water on record, with today and flood stage marked.' },
      { kind: 'improved', text: 'About half the words are gone from every page. The written summary and answers appear only when you ask for them.' },
    ],
  },
  {
    version: '1.13.0',
    date: '2026-11-25',
    title: 'Mariners\' language and units',
    changes: [
      { kind: 'improved', text: 'Tidely now speaks like a tide table: high water and low water, flood and ebb, springs and neaps, tidal range, observed and predicted, heights above chart datum.' },
      { kind: 'improved', text: 'Wind is in knots with Beaufort force, currents give set and drift, and distances are in nautical miles.' },
      { kind: 'new', text: '24-hour clock by default, with a 12-hour option under the ⓘ button.' },
    ],
  },
  {
    version: '1.12.0',
    date: '2026-11-25',
    title: 'Tidal summary and quick answers',
    changes: [
      { kind: 'new', text: 'A plain-English summary of the tide right now, and one-tap answers: lowest water this weekend, any coastal flooding this week, the week\'s extremes, and the next daylight low water. These work offline.' },
      { kind: 'improved', text: 'History folds down to one line and opens by itself when the water level is unusual.' },
    ],
  },
  {
    version: '1.11.0',
    date: '2026-11-25',
    title: 'Tidal currents',
    changes: [
      { kind: 'new', text: 'Currents tab: slack water, maximum flood and maximum ebb at the nearest NOAA current station, with an estimate of what the current is doing now. You can choose among the five nearest stations.' },
    ],
  },
  {
    version: '1.10.0',
    date: '2026-11-25',
    title: 'Easier to read, and alert levels for each station',
    changes: [
      { kind: 'improved', text: 'Better contrast throughout, in light and dark mode, and clear outlines when using a keyboard. The app now works properly with screen readers.' },
      { kind: 'improved', text: 'Alert levels for large ranges and surge are remembered separately for each station, since a large range in one place is ordinary in another.' },
    ],
  },
  {
    version: '1.9.0',
    date: '2026-11-25',
    title: 'Works offline',
    changes: [
      { kind: 'new', text: 'Tidely keeps the tide predictions for stations you have opened, and for your favorites, so the Now, Week and Plan tabs work with no signal.' },
      { kind: 'fixed', text: 'A tide could be shown with the wrong time when two tides in a row had exactly the same height.' },
      { kind: 'fixed', text: 'Times in the planner and week view could be an hour off around a daylight-saving change.' },
      { kind: 'fixed', text: 'The Plan tab could crash on older iPhones.' },
      { kind: 'fixed', text: 'After a failed station change, the header could still show the previous station\'s name.' },
      { kind: 'fixed', text: 'Typing in the search box while a zip-code lookup was under way could show results for the wrong place.' },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-11-25',
    title: 'Baltimore by default',
    changes: [
      { kind: 'improved', text: 'New visitors start at Baltimore (Fort McHenry) instead of San Francisco.' },
      { kind: 'improved', text: 'The tide calculations are now checked automatically before every update goes out.' },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-11-25',
    title: 'Flood stages and history',
    changes: [
      { kind: 'new', text: 'NOAA\'s flood stages are drawn on the chart, with a warning when the water is at flood stage or the next high water is likely to reach it.' },
      { kind: 'new', text: 'History: the last time the water stood this high or low, the last time it reached flood stage, and the highest and lowest water on record (back to 1902 at Baltimore).' },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-11-25',
    title: 'Better station search',
    changes: [
      { kind: 'new', text: 'Each station in the search shows whether it has a tide gauge (observed water level) or predictions only, and you can filter to gauges.' },
      { kind: 'new', text: 'Tap the ☆ beside any search result to save it as a favorite without leaving the search.' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-11-25',
    title: 'Week, Plan, conditions and favorites',
    changes: [
      { kind: 'new', text: 'Week tab: every high and low water for seven days, with sunrise, sunset and the moon. It can be printed.' },
      { kind: 'new', text: 'Plan tab: find the times when the height of tide is above or below a level you choose, optionally in daylight only.' },
      { kind: 'new', text: 'Conditions at the gauge: wind, sea and air temperature and barometer, plus sunrise, sunset and moon phase.' },
      { kind: 'new', text: 'Favorite stations, one tap away under the header.' },
      { kind: 'improved', text: 'No more switching between predicted and observed: Tidely uses the tide gauge whenever a station has one, and shows it against the prediction.' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-11-25',
    title: 'A shorter page',
    changes: [
      { kind: 'improved', text: 'The picture is smaller and the page about a third shorter, with settings tucked away until needed.' },
      { kind: 'improved', text: 'Phone notifications were built in this period and then put on hold. Warnings still appear in the app, and large ranges can be added to your calendar.' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-11-25',
    title: 'Tidely',
    changes: [
      { kind: 'improved', text: 'The app is now called Tidely (it began as Tide Watch).' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-11-25',
    title: 'Surge warnings you can set',
    changes: [
      { kind: 'new', text: 'Choose how far the observed water must be from the prediction before Tidely warns you of a surge: from half a foot to three feet, or off.' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-25',
    title: 'Observed water levels',
    changes: [
      { kind: 'new', text: 'Readings from NOAA\'s tide gauges, updated every six minutes, alongside the predictions, with a warning when wind or a storm pushes the water well above or below what was predicted.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-25',
    title: 'First version',
    changes: [
      { kind: 'new', text: 'A picture of where the tide is right now, with the next high and low water and a 24-hour tide curve, from NOAA predictions.' },
      { kind: 'new', text: 'Find a station by zip code, by name, or nearest to you.' },
      { kind: 'new', text: 'Alerts for unusually large tidal ranges, which you can add to your calendar.' },
    ],
  },
]

export const CURRENT_VERSION = CHANGELOG[0].version
