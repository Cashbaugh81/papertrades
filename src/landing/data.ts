/**
 * The landing page's replay: $10,000 at the start and $100 every week into
 * each portfolio, from Jan 2, 2020 to Nov 12, 2026, using the app's own price
 * cache (Tiingo adjusted closes). Values are sampled at the first trading week
 * of each month; "below its high" is measured with deposits taken out, as in
 * the app. The final point and the "Today" moment use the app's exact figures.
 *
 * This is a fixed snapshot for marketing. Regenerate it from the price cache
 * if the page is ever meant to show newer numbers.
 */

export type Mood = "hopeful" | "calm" | "thrilled" | "uneasy" | "scared" | "sick";

export type Moment = {
  key: string;
  label: string;
  title: string;
  /** Index into SERIES. */
  index: number;
  /** Total put into each portfolio by then. */
  put: number;
  story: string;
  /** Per column: value, % below its high (deposits excluded), mood. */
  cols: [number, number, Mood][];
};

export const DEFAULT_MOMENT = "2024-08";

export const MOMENTS: Moment[] = [
  {
    key: "2020-01", label: "Jan 2020", title: "Day one", index: 0, put: 10000,
    story: "$10,000 goes into each portfolio, and $100 more every week after that. Nobody knows what's coming.",
    cols: [[10000, 0, "hopeful"], [10000, 0, "hopeful"], [10000, 0, "hopeful"]],
  },
  {
    key: "2020-04", label: "Apr 2020", title: "Just after the COVID crash", index: 3, put: 11200,
    story: "Markets fell about a third in a month. The whole-market fund is worth less than you've put in.",
    cols: [[9285, -19, "uneasy"], [11272, -5, "calm"], [10441, -10, "uneasy"]],
  },
  {
    key: "2022-01", label: "Jan 2022", title: "Everything is up", index: 24, put: 20400,
    story: "Two good years. The chip mix is worth nearly three times what went in. This is when people pile in.",
    cols: [[29100, 0, "calm"], [58045, 0, "thrilled"], [33512, 0, "thrilled"]],
  },
  {
    key: "2022-10", label: "Oct 2022", title: "The long slide", index: 33, put: 24300,
    story: "A year of falling prices. The chip mix is down by half from its high, even though you kept adding $100 every week.",
    cols: [[25779, -23, "scared"], [30814, -52, "sick"], [26310, -32, "scared"]],
  },
  {
    key: "2024-08", label: "Aug 2024", title: "The summer scare", index: 55, put: 34000,
    story: "A sudden global sell-off in early August. The whole market barely flinches. Big tech slips. The chip mix loses almost a quarter of its value from the top in a few weeks.",
    cols: [[47958, -8, "calm"], [190443, -23, "scared"], [54144, -12, "uneasy"]],
  },
  {
    key: "2025-04", label: "Apr 2025", title: "The tariff shock", index: 63, put: 37300,
    story: "A sudden sell-off on trade news. Everything drops; the chip mix drops hardest, again.",
    cols: [[50054, -17, "uneasy"], [184054, -34, "scared"], [55930, -19, "uneasy"]],
  },
  {
    key: "2026-11", label: "Nov 2026", title: "Today", index: 82, put: 45800,
    story: "Same money in. Very different endings, and very different rides to get there.",
    cols: [[85946, -3, "thrilled"], [358082, -17, "uneasy"], [100765, -10, "uneasy"]],
  },
];

export const SERIES: number[][] = [
  [10000,10496,10348,9285,10416,11734,12738,13653,14275,15155,15129,17668,18193,19104,20270,21496,22483,22958,24232,24806,26068,25247,27520,27555,29100,27502,26151,29042,26646,26902,25428,27772,26918,25779,27216,28949,28094,30950,30904,31648,32291,33733,35674,36766,36962,35629,36704,39129,41128,43100,45385,46853,46738,47916,49879,47958,51593,53734,54426,58445,58012,58752,57415,50054,56445,59725,63344,64766,66305,70199,71576,71737,73340,74530,74200,71885,78650,83372,83729,84623,85972,87279,85946],
  [10000,10319,11399,11272,12443,14834,17114,19248,20431,23411,22513,26357,26197,27597,29353,30549,31010,33616,40107,39662,44213,39601,49266,56463,58045,49005,43129,53051,41106,41006,33332,41167,32683,30814,34067,39589,35450,48900,52707,60976,61788,80453,87106,92409,97570,90701,93272,94761,101021,137805,167202,176019,178324,217024,234615,190443,204401,239074,251472,256455,275932,222257,215762,184054,215361,256765,296206,332107,317575,351617,389311,345527,363650,365987,361226,352238,406396,466560,421925,428167,463928,497054,358082],
  [10000,10793,10887,10441,11843,13289,15222,16278,16797,17865,17599,20548,21125,22423,22898,23978,24748,24905,27502,28241,30107,28201,31399,31788,33512,30116,27932,32216,28166,27681,26309,29327,27729,26310,26231,28601,26753,31239,31274,33843,34463,38486,40618,41653,42382,40950,42362,44725,47125,50664,52913,53497,53440,55404,59424,54144,57827,60959,61848,65979,67771,67342,64986,55930,64567,69925,74370,76397,76998,83334,87085,85434,86157,87696,85569,83416,95791,106147,103910,101041,104181,110191,100765],
];

export const COLUMNS = [
  { name: "Whole US market", sub: "VTI · about 3,500 US companies", color: "#1D4ED8" },
  { name: "Chip-heavy", sub: "50% NVDA · 50% SMH", color: "#C8102E" },
  { name: "Big tech", sub: "QQQ · the Nasdaq-100", color: "#B8860B" },
];

export const MOODS: Record<Mood, { thought: string; urge: string; photo: "happy" | "nervous" | "scared" }> = {
  hopeful: { thought: "“Let’s see what happens.”", urge: "Wait and see", photo: "happy" },
  calm: { thought: "“Fine. Nothing to do.”", urge: "Leave it alone", photo: "happy" },
  thrilled: { thought: "“Why didn’t I put more in?”", urge: "Put more in", photo: "happy" },
  uneasy: { thought: "“Should I be doing something?”", urge: "Check it daily", photo: "nervous" },
  scared: { thought: "“Maybe I should get out until it settles.”", urge: "Sell some", photo: "scared" },
  sick: { thought: "“Sell. Now. Before it goes to zero.”", urge: "Sell everything", photo: "scared" },
};

export const PHOTO_ALT = {
  happy: "A woman smiling at her phone",
  nervous: "A woman frowning at her phone, worried",
  scared: "A woman staring at her phone in alarm",
};

export const ENDINGS = [
  { name: "Whole US market", color: "#1D4ED8", worth: "$85,946", drop: "−35%" },
  { name: "Chip-heavy", color: "#C8102E", worth: "$358,082", drop: "−59%" },
  { name: "Big tech", color: "#B8860B", worth: "$100,765", drop: "−35%" },
];
