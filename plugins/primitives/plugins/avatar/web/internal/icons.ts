import type { IconType } from "react-icons";
import {
  MdAccessTime, MdAdd, MdApi, MdAttachMoney, MdAutoAwesome, MdBarChart, MdBolt,
  MdBookmark, MdBrush, MdBugReport, MdBuild, MdCalendarToday, MdCamera, MdChat,
  MdCheckCircle, MdCloud, MdCode, MdDataObject, MdDelete, MdDescription, MdDiamond,
  MdDns, MdDownload, MdEdit, MdEmojiObjects, MdError, MdExtension, MdFavorite,
  MdFilterList, MdFlag, MdFlight, MdFolder, MdGridView, MdGroup, MdHelp, MdHome,
  MdHub, MdImage, MdInfo, MdInsights, MdKey, MdLanguage, MdLayers, MdLightbulb,
  MdLink, MdList, MdLocalFireDepartment, MdLock, MdMail, MdManageAccounts, MdMemory,
  MdMusicNote, MdNature, MdNotifications, MdPalette, MdPercent, MdPerson, MdPieChart,
  MdPlayArrow, MdPrecisionManufacturing, MdPsychology, MdRefresh, MdRocket, MdSchool,
  MdScience, MdSearch, MdSettings, MdShare, MdShield, MdSort, MdSpeed, MdStar,
  MdStorage, MdTableChart, MdTerminal, MdTimer, MdTrendingUp, MdTune, MdUpload,
  MdVideocam, MdVisibility, MdWarning, MdWifi, MdWorkOutline,
} from "react-icons/md";

// ---------------------------------------------------------------------------
// Curated registry — 84 icons with custom stable keys stored in the DB.
// These are always available without a dynamic import.
// ---------------------------------------------------------------------------

export const AVATAR_ICONS: Record<string, IconType> = {
  // Tech / dev
  robot: MdPrecisionManufacturing, code: MdCode, terminal: MdTerminal,
  bug: MdBugReport, build: MdBuild, memory: MdMemory, database: MdStorage,
  server: MdDns, api: MdApi, hub: MdHub, wifi: MdWifi, data: MdDataObject,
  // Productivity
  rocket: MdRocket, bolt: MdBolt, brain: MdPsychology, lightbulb: MdLightbulb,
  sparkle: MdAutoAwesome, fire: MdLocalFireDepartment, star: MdStar, speed: MdSpeed,
  trending: MdTrendingUp, insights: MdInsights,
  // Creative / media
  palette: MdPalette, brush: MdBrush, camera: MdCamera, image: MdImage,
  music: MdMusicNote, video: MdVideocam, emoji: MdEmojiObjects, diamond: MdDiamond,
  // Communication
  chat: MdChat, mail: MdMail, notifications: MdNotifications, share: MdShare, link: MdLink,
  // Organization
  folder: MdFolder, doc: MdDescription, bookmark: MdBookmark, edit: MdEdit,
  layers: MdLayers, grid: MdGridView, list: MdList, table: MdTableChart,
  filter: MdFilterList, sort: MdSort, tune: MdTune, settings: MdSettings,
  calendar: MdCalendarToday, clock: MdAccessTime, timer: MdTimer,
  // People / social
  person: MdPerson, group: MdGroup, account: MdManageAccounts,
  // Navigation / places
  home: MdHome, globe: MdLanguage, flight: MdFlight, nature: MdNature,
  // Status / actions
  check: MdCheckCircle, warning: MdWarning, error: MdError, info: MdInfo,
  help: MdHelp, add: MdAdd, delete: MdDelete, refresh: MdRefresh,
  download: MdDownload, upload: MdUpload,
  // Misc
  school: MdSchool, science: MdScience, shield: MdShield, lock: MdLock, key: MdKey,
  search: MdSearch, flag: MdFlag, favorite: MdFavorite, visibility: MdVisibility,
  cloud: MdCloud, extension: MdExtension, work: MdWorkOutline, play: MdPlayArrow,
  chart: MdBarChart, pie: MdPieChart, currency: MdAttachMoney, percent: MdPercent,
};

export const AVATAR_ICON_KEYS = Object.keys(AVATAR_ICONS);

// ---------------------------------------------------------------------------
// Curated search tags — inlined from Google's metadata, no JSON import needed.
// ---------------------------------------------------------------------------

const CURATED_TAGS: Record<string, string[]> = {
  robot: ["robot","robotics","manufacturing","automation","factory","industrial","machinery","engineering"],
  code: ["code","coding","programming","developer","software","html","css","script","algorithm"],
  terminal: ["terminal","command","console","prompt","shell","cli","developer","debugging"],
  bug: ["bug","error","issue","debugging","problem","software","testing","report"],
  build: ["build","wrench","settings","repair","construction","tools","maintenance","gear"],
  memory: ["memory","ram","chip","storage","hardware","processor","circuit","data"],
  database: ["database","storage","server","data","disk","archive","cloud","backup"],
  server: ["server","dns","network","hostname","domain","internet","ip","configuration"],
  api: ["api","interface","programming","backend","integration","developer","connection","web service"],
  hub: ["hub","network","connection","center","node","topology","connected","distribute"],
  wifi: ["wifi","wireless","signal","network","connection","internet","hotspot","antenna"],
  data: ["data","object","analytics","database","information","cloud","computing","structure"],
  rocket: ["rocket","launch","space","fast","startup","boost","speed","progress"],
  bolt: ["bolt","lightning","electric","fast","power","energy","flash","quick"],
  brain: ["brain","psychology","intelligence","mind","thinking","cognitive","mental","learning"],
  lightbulb: ["lightbulb","idea","innovation","inspiration","creative","bright","concept","invention"],
  sparkle: ["sparkle","ai","magic","awesome","star","auto","smart","effects","genai"],
  fire: ["fire","flame","hot","trending","popular","viral","news","emergency"],
  star: ["star","favorite","rating","bookmark","save","highlight","important","grade"],
  speed: ["speed","fast","gauge","performance","dashboard","velocity","acceleration","meter"],
  trending: ["trending","up","growth","increase","chart","analytics","statistics","rising"],
  insights: ["insights","analytics","chart","data","statistics","performance","ai","genai","spark"],
  palette: ["palette","color","design","art","theme","style","creative","paint"],
  brush: ["brush","paint","art","drawing","creative","design","stroke","illustration"],
  camera: ["camera","photo","photography","capture","picture","lens","snapshot","device"],
  image: ["image","photo","picture","gallery","media","landscape","edit","album"],
  music: ["music","note","audio","sound","melody","song","play","track"],
  video: ["video","camera","record","film","streaming","broadcast","media","videocam"],
  emoji: ["emoji","face","smile","happy","mood","expression","emotion","smiley"],
  diamond: ["diamond","gem","jewel","luxury","precious","crystal","valuable","award"],
  chat: ["chat","message","conversation","communicate","bubble","talk","discussion","support"],
  mail: ["mail","email","envelope","inbox","message","send","correspondence","letter"],
  notifications: ["notifications","bell","alert","reminder","alarm","subscribe","ring","announcement"],
  share: ["share","send","distribute","network","social","export","connect","link"],
  link: ["link","url","chain","connect","attachment","web","anchor","hyperlink"],
  folder: ["folder","file","directory","archive","organize","storage","documents","category"],
  doc: ["doc","document","file","text","paper","description","notes","article"],
  bookmark: ["bookmark","save","mark","remember","favorite","library","tag","organize"],
  edit: ["edit","pencil","modify","write","change","update","compose","author"],
  layers: ["layers","stack","overlap","hierarchy","arrange","depth","pages","panels"],
  grid: ["grid","layout","tiles","blocks","dashboard","matrix","organize","view"],
  list: ["list","items","bullet","menu","organize","catalog","agenda","checklist"],
  table: ["table","chart","spreadsheet","columns","rows","data","grid","report"],
  filter: ["filter","sort","narrow","criteria","options","manage","settings","organize"],
  sort: ["sort","order","arrange","ascending","descending","organize","list","alphabetize"],
  tune: ["tune","adjust","settings","equalizer","controls","customize","filter","sliders"],
  settings: ["settings","gear","configuration","options","preferences","adjust","control","admin"],
  calendar: ["calendar","date","schedule","event","appointment","day","month","planning"],
  clock: ["clock","time","schedule","alarm","hour","minute","watch","reminder"],
  timer: ["timer","stopwatch","countdown","alarm","time","duration","deadline","clock"],
  person: ["person","user","profile","account","avatar","human","member","identity"],
  group: ["group","people","team","members","users","community","audience","social"],
  account: ["account","user","profile","manage","settings","identity","permissions","admin"],
  home: ["home","house","residence","main","dashboard","start","building","navigation"],
  globe: ["globe","world","language","international","translate","planet","web","website"],
  flight: ["flight","airplane","travel","air","fly","transport","departure","aviation"],
  nature: ["nature","tree","plant","eco","environment","green","leaf","garden","outdoor"],
  check: ["check","done","complete","confirm","success","approve","valid","tick"],
  warning: ["warning","alert","caution","danger","attention","hazard","risk","important"],
  error: ["error","alert","problem","bug","critical","failure","invalid","exception"],
  info: ["info","information","help","about","details","notice","guide","support"],
  help: ["help","question","support","faq","guide","assistance","manual","documentation"],
  add: ["add","plus","create","new","insert","append","increase","more"],
  delete: ["delete","trash","remove","bin","clear","dispose","erase","cancel"],
  refresh: ["refresh","reload","update","sync","renew","repeat","restart","loop"],
  download: ["download","save","get","receive","install","import","transfer","cloud"],
  upload: ["upload","send","export","share","publish","backup","transfer","submit"],
  school: ["school","education","university","learning","college","graduation","campus","student"],
  science: ["science","flask","chemistry","lab","experiment","research","beaker","discovery"],
  shield: ["shield","security","protect","safe","encryption","privacy","defense","cyber"],
  lock: ["lock","secure","password","private","encryption","authentication","closed","key"],
  key: ["key","password","access","unlock","security","authentication","encryption","login"],
  search: ["search","find","magnify","explore","discover","filter","query","look"],
  flag: ["flag","marker","goal","country","bookmark","milestone","signal","achievement"],
  favorite: ["favorite","heart","love","like","save","bookmark","wish","appreciation"],
  visibility: ["visibility","show","view","eye","reveal","see","public","toggle"],
  cloud: ["cloud","storage","network","sky","weather","internet","backup","upload"],
  extension: ["extension","plugin","puzzle","jigsaw","add-on","module","block","app"],
  work: ["work","briefcase","business","office","job","career","professional","corporate"],
  play: ["play","media","video","audio","start","resume","control","button"],
  chart: ["chart","bar","analytics","statistics","graph","data","report","performance"],
  pie: ["pie","chart","circle","percentage","analytics","statistics","segments","data"],
  currency: ["currency","money","dollar","payment","finance","banking","cost","cash"],
  percent: ["percent","percentage","discount","rate","math","statistics","ratio","proportion"],
};

/** Search curated icons by name or tags — instant, no async. */
export function searchCuratedIcons(query: string): string[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return AVATAR_ICON_KEYS;
  return AVATAR_ICON_KEYS.filter((key) => {
    const haystack = [key, ...(CURATED_TAGS[key] ?? [])].join(" ");
    return words.every((w) => haystack.includes(w));
  });
}

// Keep existing export name for backward compatibility with any callers.
export { searchCuratedIcons as searchIcons };

// ---------------------------------------------------------------------------
// Official MD category display labels.
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<string, string> = {
  action: "Action", alert: "Alerts", av: "Media", communication: "Communication",
  content: "Content", device: "Device", editor: "Editor", file: "Files",
  hardware: "Hardware", image: "Images", maps: "Maps", navigation: "Navigation",
  notification: "Notifications", social: "Social", toggle: "Toggle",
};

export interface AvatarIconCategory { label: string; keys: string[] }

// Curated categories (used before the full set loads).
export const AVATAR_ICON_CATEGORIES: AvatarIconCategory[] = [
  { label: "Action",        keys: ["add","delete","check","search","refresh","download","upload","help","info","warning","error","visibility","settings","tune","filter","sort","edit","bookmark","favorite","flag","share","link"] },
  { label: "Alerts",        keys: ["warning","error","info","help","notifications"] },
  { label: "Communication", keys: ["chat","mail","share","link","notifications"] },
  { label: "Content",       keys: ["add","bookmark","edit","filter","flag","sort","link"] },
  { label: "Media",         keys: ["music","video","play","camera","image"] },
  { label: "Social",        keys: ["person","group","account","robot","school"] },
  { label: "Device",        keys: ["memory","wifi"] },
  { label: "Editor",        keys: ["palette","brush","insert:currency"] },
  { label: "Files",         keys: ["folder","doc","layers"] },
  { label: "Images",        keys: ["image","palette","camera"] },
  { label: "Maps",          keys: ["home","globe","flight","nature"] },
  { label: "Navigation",    keys: ["home","globe","flight"] },
  { label: "Hardware",      keys: ["memory","database","server","hub","wifi"] },
];

// Deduplicated flat categories for the curated picker.
export const AVATAR_ICON_CATEGORIES_FLAT: AvatarIconCategory[] = (() => {
  const seen = new Set<string>();
  const cats: AvatarIconCategory[] = [
    { label: "Tech",          keys: ["robot","code","terminal","bug","build","memory","database","server","api","hub","wifi","data"] },
    { label: "Productivity",  keys: ["rocket","bolt","brain","lightbulb","sparkle","fire","star","speed","trending","insights"] },
    { label: "Creative",      keys: ["palette","brush","camera","image","music","video","emoji","diamond"] },
    { label: "Communication", keys: ["chat","mail","notifications","share","link"] },
    { label: "Organization",  keys: ["folder","doc","bookmark","edit","layers","grid","list","table","filter","sort","tune","settings","calendar","clock","timer"] },
    { label: "People",        keys: ["person","group","account"] },
    { label: "Places",        keys: ["home","globe","flight","nature"] },
    { label: "Status",        keys: ["check","warning","error","info","help","add","delete","refresh","download","upload"] },
    { label: "Misc",          keys: ["school","science","shield","lock","key","search","flag","favorite","visibility","cloud","extension","work","play","chart","pie","currency","percent"] },
  ];
  return cats.map(({ label, keys }) => ({
    label,
    keys: keys.filter((k) => { if (seen.has(k)) return false; seen.add(k); return true; }),
  })).filter((c) => c.keys.length > 0);
})();

// ---------------------------------------------------------------------------
// Full icon set — dynamically loaded on demand (react-icons/md + metadata JSON).
// Keys for newly-selected icons are mdNames (e.g. "rocket", "access_time").
// Existing DB rows with custom keys still resolve via AVATAR_ICONS above.
// ---------------------------------------------------------------------------

export interface FullIconEntry { key: string; Icon: IconType; label: string }
export interface FullIconCategory { label: string; entries: FullIconEntry[] }
export interface FullIconSet {
  categories: FullIconCategory[];
  search: (query: string) => FullIconEntry[];
}

let _mdCache: Record<string, unknown> | null = null;
let _fullSetCache: FullIconSet | null = null;

function mdNameToReactKey(mdName: string): string {
  return "Md" + mdName.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

export async function loadFullIconSet(): Promise<FullIconSet> {
  if (_fullSetCache) return _fullSetCache;

  const [mdModule, { default: meta }] = await Promise.all([
    import("react-icons/md"),
    import("./icon-metadata.json"),
  ]);

  _mdCache = mdModule as Record<string, unknown>;
  const metaTyped = meta as Record<string, { category: string; tags: string[] }>;

  type RichEntry = FullIconEntry & { category: string; tags: string[] };
  const entries: RichEntry[] = [];

  for (const [mdName, { category, tags }] of Object.entries(metaTyped)) {
    const Icon = _mdCache[mdNameToReactKey(mdName)] as IconType | undefined;
    if (!Icon) continue;
    entries.push({ key: mdName, Icon, label: mdName.replace(/_/g, " "), category, tags });
  }

  const catMap = new Map<string, FullIconEntry[]>();
  for (const { key, Icon, label, category } of entries) {
    const catLabel = CATEGORY_LABELS[category] ?? category;
    if (!catMap.has(catLabel)) catMap.set(catLabel, []);
    catMap.get(catLabel)!.push({ key, Icon, label });
  }

  const categories: FullIconCategory[] = Array.from(catMap.entries()).map(([label, es]) => ({ label, entries: es }));

  const search = (query: string): FullIconEntry[] => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return entries
      .filter(({ key, label, tags }) => {
        const haystack = [key, label, ...tags].join(" ").toLowerCase();
        return words.every((w) => haystack.includes(w));
      })
      .map(({ key, Icon, label }) => ({ key, Icon, label }));
  };

  _fullSetCache = { categories, search };
  return _fullSetCache;
}

// ---------------------------------------------------------------------------
// resolveAvatarIcon — synchronous; covers both custom keys and mdName keys
// (the latter once the dynamic import has settled).
// ---------------------------------------------------------------------------

export function resolveAvatarIcon(key: string | null | undefined): IconType | null {
  if (!key) return null;
  if (AVATAR_ICONS[key]) return AVATAR_ICONS[key]!;
  if (_mdCache) {
    return (_mdCache[mdNameToReactKey(key)] as IconType | undefined) ?? null;
  }
  return null;
}

export const DEFAULT_AGENT_AVATAR = { icon: "robot", color: "violet" } as const;
