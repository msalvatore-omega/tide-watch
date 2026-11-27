// Plain-English definitions of the nautical terms Tidely uses, and a short "how to read
// this" for each panel. Shown by the ? buttons and in the glossary (ⓘ → Glossary).

export const TERMS = {
  'height of tide': 'How high the water surface is above chart datum at a given moment. It is not the depth: depth is the charted depth plus the height of tide.',
  'chart datum': 'The low-water level that depths on a nautical chart are measured from. In the US it is MLLW, the average of the lower of each day\'s two low waters, so the tide is rarely below it.',
  MLLW: 'Mean Lower Low Water: the average height of the lower low water of each day. US charts and tide tables use it as zero.',
  'high water': 'The highest level the tide reaches before it starts to fall. Written HW.',
  'low water': 'The lowest level the tide reaches before it starts to rise. Written LW.',
  flood: 'The rising tide, and the current that flows in with it. (Coastal flooding is a different thing: see flood stage.)',
  ebb: 'The falling tide, and the current that flows out with it.',
  stand: 'The short pause at high or low water when the level is neither rising nor falling.',
  'tidal range': 'The difference in height between one high water and the next low water. A large range means a lot of water moving.',
  springs: 'Spring tides: the larger ranges that come every two weeks, around new and full moon. Nothing to do with the season.',
  neaps: 'Neap tides: the smaller ranges that come around the half moons, between springs.',
  observed: 'Measured by a tide gauge in the water. Shows what wind and weather are actually doing to the level.',
  predicted: 'Calculated in advance from the moon and sun. It does not include the effect of wind or storms.',
  surge: 'Water pushed above the prediction by wind and low pressure (or below it, when an offshore wind blows the water out).',
  'flood stage': 'The height at which water starts to come over the land at this place. NOAA publishes minor, moderate and major stages.',
  'slack water': 'The moment the current stops before it turns. It often does not happen at the same time as high or low water.',
  set: 'The direction a current flows toward, in degrees true. A set of 310° is flowing to the north-west.',
  drift: 'The speed of a current, in knots.',
  knot: 'One nautical mile per hour, about 1.15 mph.',
  'nautical mile': 'One minute of latitude: 1,852 metres, about 1.15 statute miles.',
  'Beaufort force': 'A 0 to 12 scale of wind strength. Force 4 (11 to 16 knots) is a moderate breeze; force 6 a strong breeze; force 8 a gale.',
  barometer: 'Air pressure. A falling barometer usually means weather is on the way; a fast fall, strong wind.',
  'under-keel clearance': 'The water between the bottom of your boat and the seabed: depth minus draft.',
  draft: 'How deep your boat sits in the water, from the waterline to its lowest point.',
  'charted depth': 'The depth printed on the chart at a spot: the depth when the tide is at chart datum.',
  'small craft advisory': 'A National Weather Service warning that wind or waves are hazardous to small boats (typically winds of about 20 to 33 knots).',
}

export const EXPLAIN = {
  scene: {
    title: 'The tide now',
    how: [
      'The big figure is the height of tide now, and whether it is flooding or ebbing. The gauge on the left is filled to that height, on the same scale as the curve beside it.',
      'The curve starts 9 hours ago and runs 7 days ahead: slide it sideways with your thumb to look into the coming week, and press Now to come back. Dashed blue is the prediction, red is what the gauge has measured, and the red dashed line is now. Dots mark high and low water; the orange line is flood stage.',
      'The moon at the top is drawn at tonight\'s phase, with the phase named beneath it and the days to the next full or new moon; near new and full moon the tides are springs, with larger ranges. Beneath are the next high and low water, and the wind, air and sea temperature and barometer at the gauge.',
    ],
    terms: ['height of tide', 'high water', 'low water', 'flood', 'ebb', 'observed', 'predicted', 'flood stage', 'springs', 'neaps', 'chart datum', 'knot', 'barometer'],
  },
  dial: {
    title: 'The tide dial',
    how: [
      'The arc runs from low water on the left to high water on the right. The marker shows how far through this tide the water is: red when measured by the gauge, dark when predicted.',
      'The middle gives the height and whether the tide is flooding or ebbing. The ends give the next low and high water with the time remaining; the one coming first is in bold.',
    ],
    terms: ['height of tide', 'flood', 'ebb', 'stand', 'observed', 'predicted', 'chart datum'],
  },
  chart: {
    title: 'The tide curve',
    how: [
      'The dashed blue line is the predicted tide, from 9 hours ago to 24 hours ahead. The red line is what the gauge has measured.',
      'A gap between the two is the effect of wind and weather. Dots mark high and low water; the orange line is flood stage.',
    ],
    terms: ['observed', 'predicted', 'surge', 'flood stage', 'high water', 'low water'],
  },
  history: {
    title: 'History',
    how: [
      'The bar runs from the lowest water ever measured here to the highest. The red marker is the height now; the hatched part is above flood stage.',
      'Open it for when the water was last this high or low, and when it last reached flood stage.',
    ],
    terms: ['observed', 'flood stage', 'chart datum'],
  },
  ranges: {
    title: 'Large ranges',
    how: [
      'These are the unusually large rises and falls of the coming week: more water moving than usual, so stronger currents and bigger changes in depth.',
      'Each row gives the size, how it compares with the usual range here, and the low and high water it runs between.',
    ],
    terms: ['tidal range', 'springs', 'neaps'],
  },
  sun: {
    title: 'Sun and moon',
    how: [
      'The bar is the 24 hours of today: yellow is daylight, the red marker is now. The moon is drawn as it looks tonight, with today\'s moonrise and moonset beneath (about once a month a day has no moonrise, or no moonset).',
      'Around new and full moon the tides are springs, with larger ranges; around the half moons they are neaps.',
    ],
    terms: ['springs', 'neaps'],
  },
  week: {
    title: 'The week',
    how: [
      'Each row is one day from midnight to midnight, with the tide drawn as a curve. Grey shading is night.',
      'Blue dots are high water and amber dots low water, with the time above and the height below. A ring marks the end of an unusually large range.',
    ],
    terms: ['high water', 'low water', 'tidal range', 'chart datum'],
  },
  plan: {
    title: 'Tidal windows',
    how: [
      'Drag the green line on the curve to the height you need, and choose above or below. The bars show, day by day, when the tide meets it. Grey is night.',
      'Tap a green bar for its start, end and length. Add a margin for your draft and for wind, which can shift the times.',
    ],
    terms: ['height of tide', 'draft', 'under-keel clearance', 'predicted'],
  },
  currents: {
    title: 'Currents',
    how: [
      'The compass arrow points where the current is flowing to; a longer arrow is a stronger current. The big number is its speed.',
      'The curve below shows the next 24 hours: flood above the line, ebb below, with diamonds at slack water.',
    ],
    terms: ['flood', 'ebb', 'slack water', 'set', 'drift', 'knot'],
  },
  berth: {
    title: 'My berth',
    how: [
      'Enter the charted depth at your dock, mooring or ramp and your boat\'s draft. Tidely adds the height of tide to show the depth of water there now and the clearance under your keel.',
      'It also tells you when the water will next be too thin, from the predictions. Wind can change the real level, so keep a margin.',
    ],
    terms: ['charted depth', 'draft', 'under-keel clearance', 'height of tide'],
  },
  goodtime: {
    title: 'By your rules',
    how: [
      'Three lights for common jobs, each driven by a rule you set: enough water to launch, little enough to work the flats, and the turn of the tide for fishing.',
      'Green means the rule is met now; amber, within two hours; grey shows the next time. They describe the tide only, not whether it is safe to go.',
    ],
    terms: ['height of tide', 'stand', 'slack water'],
  },
  marine: {
    title: 'Marine warnings and forecast',
    how: [
      'Warnings and advisories in force for these waters, and the marine forecast, from the National Weather Service.',
      'Tap a warning for what it means and what mariners are advised to do.',
    ],
    terms: ['small craft advisory', 'knot', 'Beaufort force'],
  },
}
