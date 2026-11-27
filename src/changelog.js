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
    version: '2.5.0',
    date: '2026-11-27',
    title: 'The moon phase, named',
    changes: [
      { kind: 'new', text: 'The moon on the main picture now has its phase written underneath, such as "Waxing gibbous", so you can tell where the moon is in its cycle at a glance.' },
      { kind: 'new', text: 'Beneath the phase it says how many days until the next full or new moon, and whether tides are springs or neaps.' },
    ],
  },
  {
    version: '2.4.0',
    date: '2026-11-27',
    title: 'Slide the tide graph into the coming week',
    changes: [
      { kind: 'new', text: 'The main tide graph now slides sideways: drag it with your thumb to see high and low water for the next 7 days, with each day marked along the bottom.' },
      { kind: 'new', text: 'A Now button appears once you have slid ahead, to bring the graph straight back to the present.' },
      { kind: 'improved', text: 'The height gauge stays in place at the left while the graph slides, so heights can always be read off the same scale.' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-11-26',
    title: 'Moonrise and moonset',
    changes: [
      { kind: 'new', text: 'Moonrise and moonset times. The next one shows under the moon on the main graphic, and both of today\'s are in the Sun and moon row, with whether the moon is up now.' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-11-26',
    title: 'Plain line icons',
    changes: [
      { kind: 'improved', text: 'The colourful emoji are replaced throughout by plain line icons that match the rest of the page and look the same on every phone.' },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-11-26',
    title: 'The moon on the main graphic',
    changes: [
      { kind: 'new', text: 'Tonight\'s moon is drawn at its true phase at the top of the main graphic, with a note when the tides are springs or neaps.' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-11-26',
    title: 'A calmer, simpler Tidely',
    changes: [
      { kind: 'improved', text: 'The Now page is rebuilt around one clear graphic: the height of tide in large figures, a level gauge, and the tide curve beside it on the same scale, with the measured water, the prediction and flood stage.' },
      { kind: 'improved', text: 'The beach picture and the dial are retired. Everything they showed is in the new graphic, so the same facts are no longer drawn three times.' },
      { kind: 'improved', text: 'Next high and low water sit side by side beneath the graphic, soonest first, with the wind, temperatures and barometer on one line below.' },
      { kind: 'improved', text: 'All warnings are in one row: coastal flooding, surge, large ranges and National Weather Service warnings. Tap one for the detail.' },
      { kind: 'improved', text: 'Everything else is folded into single rows you open when you want them: marine forecast, sun and moon, your rules, quick answers, history and large ranges. The page is about a third shorter.' },
      { kind: 'improved', text: 'Plan now opens on the tidal windows, with My berth and your rules folded beneath.' },
    ],
  },
  {
    version: '1.17.0',
    date: '2026-11-26',
    title: 'Find yourself on the station map',
    changes: [
      { kind: 'new', text: 'The station map can show where you are: tap the target button on the map (or 📍 Nearest) and a blue dot marks your position, with the nearest stations listed beneath.' },
      { kind: 'improved', text: 'The map follows your search: type a port or station name and it frames the matches, or enter a zip code and it moves there.' },
    ],
  },
  {
    version: '1.16.0',
    date: '2026-11-26',
    title: 'Easier to read, and more to go on',
    changes: [
      { kind: 'improved', text: 'The picture is easier to read: a numbered tide staff, a red tag with the height now, and dashed lines showing where the next high and low water will reach.' },
      { kind: 'new', text: 'Wind, air and sea temperature and the barometer now run across the top of the picture, so the present conditions are in one glance.' },
      { kind: 'new', text: 'Marine warnings in force (gale, small craft, coastal flood and the rest) and the marine forecast for your waters, from the National Weather Service. Tap a warning for the detail and the advice to mariners.' },
      { kind: 'new', text: 'A ? on every panel explains how to read it and what its terms mean. Underlined words explain themselves, and the full glossary is under ⓘ at the foot of the page.' },
      { kind: 'new', text: 'A short tour on your first visit. Skip it if you like, and find it again under ⓘ.' },
      { kind: 'new', text: 'The height in context: a line under the dial says how the water now compares with a usual high and low water here.' },
      { kind: 'new', text: 'My berth, on the Plan tab: enter the charted depth at your dock, mooring or ramp and your draft to see the depth of water there now, the clearance under your keel, and when you are predicted to touch bottom.' },
      { kind: 'new', text: 'By your rules: three lights for launching, fishing the turn of the tide and walking the flats, each driven by figures you set. They describe the tide only; whether to go is still your call.' },
      { kind: 'new', text: 'A map for choosing a station. Filled red markers have a tide gauge; hollow blue ones give predictions only.' },
      { kind: 'new', text: 'A confidence note under the tide curve tells you how closely the gauge has followed the predictions over the last 24 hours.' },
      { kind: 'new', text: 'Wind against tide: the Currents tab warns when the wind is blowing against the current, which makes for a short, steep sea.' },
      { kind: 'new', text: 'Share button beside the station name: send the present tide as a picture and a link, or copy it where sharing is not available.' },
      { kind: 'new', text: 'Choice of units under ⓘ: feet and °F, or metres and °C. Speeds stay in knots.' },
      { kind: 'improved', text: 'Every chart now has a legend beneath it saying what each line and dot means.' },
    ],
  },
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
