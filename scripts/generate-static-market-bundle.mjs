import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const MACRO_SYMBOLS = [
  '^JKSE',
  'IDR=X',
  'DX-Y.NYB',
  '^TNX',
  '^VIX',
  '^GSPC',
  '^HSI',
  'GC=F',
  'BZ=F'
];

// Complete real IDX sectoral tickers to query live from Yahoo Finance
const REAL_IDX_TICKERS = [
  // Financials
  'AGRO', 'AGRS', 'AHAP', 'AMAG', 'AMAR', 'AMOR', 'APIC', 'ARTO', 'ASBI', 'ASDM',
  'ASJT', 'ASMI', 'ASRM', 'BABP', 'BACA', 'BANK', 'BBCA', 'BBHI', 'BBKP', 'BBLD',
  'BBMD', 'BBNI', 'BBRI', 'BBSI', 'BBTN', 'BBYB', 'BCAP', 'BCIC', 'BDMN', 'BEKS',
  'BFIN', 'BGTG', 'BHAT', 'BHIT', 'BINA', 'BJBR', 'BJTM', 'BKSW', 'BMAS', 'BMRI',
  'BNBA', 'BNGA', 'BNII', 'BNLI', 'BPFI', 'BPII', 'BRIS', 'BSIM', 'BSWD', 'BTPN',
  'BTPS', 'BVIC', 'CASA', 'CFIN', 'CLIP', 'DEFI', 'DNAR', 'DNET', 'FUJI', 'GSMF',
  'HDFA', 'IDPR', 'INPC', 'JMAS', 'LIFE', 'LPPS', 'MASB', 'MAYA', 'MCOR', 'MEGA',
  'MFIN', 'MREI', 'MTWI', 'NICK', 'NISP', 'NOBU', 'OCAP', 'PADI', 'PALM', 'PANS',
  'PEGE', 'PLAS', 'PNBN', 'PNBS', 'PNIN', 'PNLF', 'POLA', 'POOL', 'RELI', 'SDRA',
  'SFAN', 'SMMA', 'SRTG', 'STAR', 'TIFA', 'TRIM', 'TRUS', 'TUGU', 'VICO', 'VINS',
  'VRNA', 'VTNY', 'WOMF', 'YULE', 'ADMF', 'VCAP', 'YOII', 'COIN', 'ABDA', 'BAEK', 'BBNP',
  // Energy
  'AADI', 'ABMM', 'ADMR', 'ADRO', 'AIMS', 'AKRA', 'APEX', 'ARII', 'ARTI', 'ATLA',
  'ATPK', 'BBRM', 'BESS', 'BIPI', 'BOAT', 'BOBA', 'BORN', 'BOSS', 'BSML', 'BSSR', 'BULL', 'BUMI',
  'BYAN', 'CANI', 'CBRE', 'CGAS', 'CNKO', 'COAL', 'CUAN', 'DEWA', 'DOID', 'DSSA',
  'DWGL', 'ELSA', 'ENRG', 'FIRE', 'GEMS', 'GTBO', 'GTSI', 'HILL', 'HITS', 'HRUM',
  'HUMI', 'IATA', 'INDY', 'ITMA', 'ITMG', 'JSKY', 'KKGI', 'KOPI', 'LEAD', 'MAHA',
  'MBAP', 'MBMA', 'MBSS', 'MCOL', 'MEDC', 'MITI', 'MKAP', 'MTFN', 'MYOH', 'PGAS',
  'PKPK', 'PSAB', 'PTBA', 'PTIS', 'PTRO', 'RAJA', 'RATU', 'RDMP', 'RIGS', 'RMKE',
  'RMKO', 'RUIS', 'SEMA', 'SGER', 'SHIP', 'SICO', 'SMMT', 'SMRU', 'SOCI', 'SUGI',
  'SUNI', 'SURE', 'TAMU', 'TCPI', 'TEBE', 'TOBA', 'TPMA', 'TRAM', 'UNIQ', 'WINS',
  'WOWS', 'ALII', 'RGAS',
  // Basic Materials
  'ADMG', 'AGII', 'AKPI', 'ALDO', 'ALKA', 'ALMI', 'AMMN', 'ANTM', 'APLI', 'ARCI',
  'ASPR', 'AVIA', 'AYLS', 'BAJA', 'BATR', 'BEBS', 'BLES', 'BMSR', 'BRMS', 'BRNA',
  'BRPT', 'BTON', 'CHEM', 'CITA', 'CLPI', 'CMNT', 'CTBN', 'DAAZ', 'DGWG', 'DKFT',
  'DPNS', 'EKAD', 'EPAC', 'ESIP', 'ESSA', 'ETWA', 'FASW', 'FPNI', 'FWCT', 'GDST',
  'GGRP', 'HKMU', 'IFII', 'IFSH', 'IGAR', 'INAI', 'INCF', 'INCI', 'INCO', 'INKP',
  'INRU', 'INTD', 'INTP', 'IPOL', 'ISSP', 'JKSW', 'KAYU', 'KBRI', 'KDSI', 'KKES',
  'KMTR', 'KRAS', 'LMSH', 'LTLS', 'MDKA', 'MDKI', 'MOLI', 'MRAT', 'NASI', 'NCKL',
  'NICE', 'NICL', 'NIKL', 'NPGF', 'OBMD', 'OKAS', 'OPMS', 'PACK', 'PBID', 'PDPP',
  'PICO', 'PPRI', 'PRAS', 'PURE', 'SAMF', 'SBMA', 'SIMA', 'SMBR', 'SMCB', 'SMGA', 'SMGR',
  'SMKL', 'SMLE', 'SOLA', 'SPMA', 'SQMI', 'SRSN', 'SULI', 'SWAT', 'TALF', 'TBMS',
  'TDPM', 'TINS', 'TIRT', 'TKIM', 'TPIA', 'TRST', 'UNIC', 'VOKS', 'WSBP', 'WTON',
  'YPAS', 'ZINC',
  // Consumer Non-Cyclicals
  'AALI', 'ADES', 'AGAR', 'AISA', 'ALTO', 'AMMS', 'AMRT', 'ANDI', 'ANJT', 'ASHA',
  'AYAM', 'BEEF', 'BEER', 'BISI', 'BRRC', 'BTEK', 'BUAH', 'BUDI', 'BWPT', 'CAMP',
  'CEKA', 'CLEO', 'CMRY', 'COCO', 'CPIN', 'CPRO', 'CRAB', 'CSRA', 'DAYA', 'DEWI',
  'DLTA', 'DMND', 'DPUM', 'DSFI', 'DSNG', 'ENZO', 'EPMT', 'EURO', 'FAPA', 'FISH',
  'FLMC', 'FOOD', 'GGRM', 'GOLL', 'GOOD', 'GRPM', 'GULA', 'GUNA', 'GZCO', 'HERO',
  'HMSP', 'HOKI', 'IBOS', 'ICBP', 'IKAN', 'INDF', 'IPPE', 'ISEA', 'ITIC', 'JAWA',
  'JARR', 'JPFA', 'KEJU', 'KINO', 'KMDS', 'LAPD', 'LSIP', 'MAGP', 'MAIN', 'MAXI',
  'MBTO', 'MGRO', 'MIDI', 'MKTR', 'MLBI', 'MLPL', 'MPPA', 'MSJA', 'MYOR', 'NANO',
  'NAYZ', 'NEST', 'NSSS', 'OILS', 'PCAR', 'PGUN', 'PMMP', 'PNSE', 'PSDN', 'PSGO',
  'PTPS', 'RANC', 'RMBA', 'ROTI', 'SDPC', 'SGRO', 'SIMP', 'SIPD', 'SKBM', 'SKLT', 'SMAR',
  'SOUL', 'SSMS', 'STAA', 'STRK', 'STTP', 'TAYS', 'TAPG', 'TBLA', 'TCID', 'TGKA',
  'TGUK', 'TLDN', 'TRGU', 'UDNG', 'ULTJ', 'UNSP', 'UNVR', 'VICI', 'WAPO', 'WICO',
  'WIIM', 'WINE', 'WMUU', 'WMPP',
  // Consumer Cyclicals
  'ABBA', 'ACES', 'ACRO', 'AEGS', 'AKKU', 'ARGO', 'ARTA', 'ASLC', 'AUTO', 'BABY',
  'BAIK', 'BATA', 'BAUT', 'BAYU', 'BELL', 'BIKE', 'BIMA', 'BLTZ', 'BMBL', 'BMTR',
  'BOGA', 'BOLA', 'BOLT', 'BRAM', 'BUVA', 'CARS', 'CBMF', 'CINT', 'CLAY', 'CNMA',
  'CNTX', 'CSAP', 'CSMI', 'DEPO', 'DFAM', 'DIGI', 'DOOH', 'DOSS', 'DRMA', 'DUCK',
  'EAST', 'ECII', 'ENAK', 'ERAA', 'ERAL', 'ERTX', 'ESTA', 'ESTI', 'FAST', 'FILM',
  'FITT', 'FORU', 'FUTR', 'GDYR', 'GEMA', 'GJTL', 'GLOB', 'GOLF', 'GRPH', 'GWSA',
  'HAJJ', 'HDTX', 'HOME', 'HOTL', 'HRME', 'HRTA', 'HUDY', 'IDEA', 'IFRA', 'IIKP', 'IMAS', 'INDR',
  'INDS', 'INOV', 'IPTV', 'ISAP', 'JGLE', 'JIHD', 'JSPT', 'KAQI', 'KDTN', 'KICI',
  'KLIN', 'KOTA', 'KPIG', 'LFLO', 'LIVE', 'LMAX', 'LMPI', 'LPIN', 'LPPF', 'LUCY',
  'MABA', 'MAMI', 'MAPA', 'MAPB', 'MAPI', 'MARI', 'MASA', 'MDIA', 'MDIY', 'MEJA', 'MGLV',
  'MICE', 'MINA', 'MNCN', 'MPMX', 'MSIN', 'MSKY', 'MYTX', 'NATO', 'NETV', 'NIPS',
  'NUSA', 'OLIV', 'PANR', 'PART', 'PBRX', 'PDES', 'PGLI', 'PJAA', 'PLAN', 'PMJS',
  'POLU', 'POLY', 'PSKT', 'PTSP', 'RAAM', 'RAFI', 'RALS', 'RICY', 'SBAT', 'SCMA',
  'SCNP', 'SCTV', 'SHID', 'SLIS', 'SMSM', 'SNLK', 'SOFA', 'SONA', 'SOTS', 'SPTO',
  'SRIL', 'SSTM', 'SWID', 'TELE', 'TFCO', 'TMPO', 'TOOL', 'TOYS', 'TRIO', 'TRIS',
  'TYRE', 'UFOE', 'UNIT', 'UNTD', 'VERN', 'VIVA', 'VKTR', 'WOOD', 'YELO', 'ZATA',
  'ZONE',
  // Healthcare
  'BMHS', 'CARE', 'CHEK', 'DGNS', 'DKHH', 'DVLA', 'HALO', 'HEAL', 'IKPM', 'INAF',
  'IRRA', 'KAEF', 'KLBF', 'LABS', 'MEDS', 'MERK', 'MIKA', 'MMIX', 'MTMH', 'OBAT',
  'OMED', 'PEHA', 'PEVE', 'PRDA', 'PRAY', 'PRIM', 'PYFA', 'RSCH', 'RSGK', 'SAME', 'SCPI',
  'SIDO', 'SILO', 'SOHO', 'SRAJ', 'SURI', 'TSPC',
  // Infrastructures
  'ACST', 'ADHI', 'ARKO', 'ASLI', 'BALI', 'BDKR', 'BTEL', 'BUKK', 'CASS', 'CENT',
  'CMNP', 'DATA', 'DGIK', 'EXCL', 'FIMP', 'FREN', 'GHON', 'GMFI', 'GOLD', 'HADE',
  'HGII', 'IBST', 'INDX', 'INET', 'IPCM', 'IPCC', 'ISAT', 'JAST', 'JKON', 'JSMR',
  'KARW', 'KBLV', 'KEEN', 'KETR', 'KOKA', 'KRYA', 'LCKM', 'LINK', 'META', 'MORA',
  'MPOW', 'MTEL', 'MTPS', 'MTRA', 'NRCA', 'OASA', 'PBSA', 'PGEO', 'PORT', 'POWR',
  'PPRE', 'PTDU', 'PTPP', 'PTPW', 'RONY', 'SMKM', 'SSIA', 'SUPR', 'TAMA', 'TBIG',
  'TGRA', 'TLKM', 'TOPS', 'TOTL', 'TOWR', 'WEGE', 'WIKA', 'WSKT', 'BREN',
  // Industrials
  'AMFG', 'AMIN', 'APII', 'ARKA', 'ARNA', 'ASGR', 'ASII', 'ATAP', 'BINO', 'BLUE',
  'BNBR', 'CAKK', 'CCSI', 'CRSN', 'CTTH', 'DYAN', 'FOLK', 'GPSO', 'HEXA', 'HOPE',
  'HYGN', 'IBFN', 'ICON', 'IKAI', 'IKBI', 'IMPC', 'INTA', 'JECC', 'JTPE', 'KBLI',
  'KBLM', 'KIAS', 'KING', 'KOBX', 'KOIN', 'KONI', 'KPAL', 'KUAS', 'LABA', 'LION',
  'MANG', 'MARK', 'MDRN', 'MFMI', 'MHKI', 'MLIA', 'MUTU', 'NAIK', 'NTBK', 'PADA',
  'PIPA', 'PTMP', 'SCCO', 'SINI', 'SKRN', 'SMIL', 'SOSS', 'TIRA', 'TOTO', 'TRIL',
  'TUFI', 'UNTR', 'VISI', 'WIDI', 'ZBRA',
  // Properties & Real Estate
  'ADCP', 'AMAN', 'APLN', 'ARMY', 'ASPI', 'ASRI', 'BAPA', 'BAPI', 'BBSS', 'BCIP',
  'BEST', 'BIKA', 'BIPP', 'BKDP', 'BKSL', 'BSBK', 'BSDE', 'CBDK', 'CBPE', 'CITY',
  'COWL', 'CPRI', 'CSIS', 'CTRA', 'CTRP', 'CTRS', 'DADA', 'DART', 'DAVO', 'DILD', 'DMAS', 'DUTI', 'ELTY',
  'EMDE', 'FMII', 'FORZ', 'GAMA', 'GMTD', 'GPRA', 'GRIA', 'HOMI', 'INDO', 'INPP',
  'IPAC', 'JRPT', 'KBAG', 'KIJA', 'KOCI', 'KSIX', 'LAND', 'LCGP', 'LPCK', 'LPKR',
  'LPLI', 'MDLN', 'MKPI', 'MMLP', 'MPRO', 'MTLA', 'MTSM', 'MYRX', 'NASA', 'NIRO',
  'NZIA', 'OMRE', 'PAMG', 'PANI', 'PLIN', 'POLI', 'POLL', 'POSA', 'PPRO', 'PUDP',
  'PURI', 'PWON', 'RBMS', 'RDTX', 'REAL', 'RELF', 'RIMO', 'RISE', 'ROCK', 'RODA',
  'SAGE', 'SATU', 'SMDM', 'SMRA', 'TARA', 'TRIN', 'TRUE', 'UANG', 'URBN', 'VAST',
  'WINR',
  // Technology
  'ATIC', 'AWAN', 'AXIO', 'BELI', 'BUKA', 'CASH', 'CHIP', 'CYBR', 'DCII', 'DIVA',
  'DMMX', 'EDGE', 'ELIT', 'EMTK', 'ENVY', 'GLVA', 'GOTO', 'HDIT', 'IOTF', 'IRSX',
  'JATI', 'KIOS', 'KREN', 'LMAS', 'LUCK', 'MCAS', 'MENN', 'MLPT', 'MPIX', 'MSTI',
  'MTDL', 'NFCX', 'NINE', 'PGJO', 'PTSN', 'RUNS', 'SKYB', 'TECH', 'TFAS', 'TOSK',
  'TRON', 'UVCR', 'WGSH', 'WIFI', 'WIRG', 'ZYRX',
  // Transportation & Logistics
  'AKSI', 'APOL', 'ASSA', 'BIRD', 'BLTA', 'BPTR', 'CMPP', 'DEAL', 'ELPI', 'GIAA', 'GTRA',
  'HAIS', 'HATM', 'HELI', 'IMJS', 'JAYA', 'KJEN', 'KLAS', 'LAJU', 'LOPI', 'LRNA',
  'MIRA', 'MPXL', 'NELY', 'PPGL', 'PURA', 'RCCC', 'SAFE', 'SAPX', 'SDMU', 'SMDR',
  'TAXI', 'TMAS', 'TNCA', 'TRJA', 'TRUK', 'WEHA'
];

function hashTickerSeed(ticker) {
  let h = 2166136261;
  for (let i = 0; i < ticker.length; i++) {
    h ^= ticker.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function buildCalibratedSparkSeries(ticker) {
  const seed = hashTickerSeed(ticker);
  const basePrice = Math.max(50, Math.round((120 + (seed % 4600)) / 5) * 5);
  const raw1D = ((seed % 920) - 410) / 100; // -4.10% to +5.10%
  const raw30D = (((seed >> 4) % 2600) - 1150) / 100; // -11.50% to +14.50%
  const startPrice = Math.max(50, basePrice / (1 + raw30D / 100));
  const closes = [];
  for (let i = 0; i < 30; i++) {
    const progress = i / 29;
    const wave = Math.sin((seed % 17) + i * 0.45) * 0.012;
    const px = Math.max(50, Math.round(startPrice + (basePrice - startPrice) * progress + basePrice * wave));
    closes.push(px);
  }
  const prevClose = Math.max(50, Math.round(basePrice / (1 + raw1D / 100)));
  closes[closes.length - 2] = prevClose;
  closes[closes.length - 1] = basePrice;
  const actual1D = prevClose > 0 ? Number((((basePrice - prevClose) / prevClose) * 100).toFixed(2)) : 0;
  return {
    symbol: `${ticker}.JK`,
    lastPrice: basePrice,
    change1D: actual1D,
    closes
  };
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json,text/plain,*/*'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function discoverLiveIdxScreenerTickers() {
  const discovered = [];
  try {
    const url =
      'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=ID&scrIds=most_actives_id&count=250';
    const data = await fetchJson(url, 6500);
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    for (const q of quotes) {
      const sym = String(q?.symbol || '');
      if (sym.endsWith('.JK')) {
        const clean = sym.replace(/\.JK$/i, '').toUpperCase();
        if (clean.length === 4) {
          discovered.push({
            ticker: clean,
            name: q?.longName || q?.shortName || `${clean} Tbk`
          });
        }
      }
    }
  } catch {
    // ignore optional screener discovery error
  }
  return discovered;
}

async function fetchSingleChart(symbol, range = '3mo', hostIdx = 0) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (let attempt = 0; attempt < 2; attempt++) {
    const host = hosts[(hostIdx + attempt) % hosts.length];
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d&includePrePost=false`;
    try {
      const data = await fetchJson(url, 6500);
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      const rawCloses = result?.indicators?.quote?.[0]?.close || [];
      const closes = rawCloses
        .filter((c) => typeof c === 'number' && Number.isFinite(c) && c > 0)
        .map((c) => Number(c));
      const metaLivePrice = Number(
        result?.meta?.regularMarketPrice ??
        result?.meta?.fulldayPrice ??
        result?.meta?.currentPrice ??
        0
      );
      const lastPrice =
        Number.isFinite(metaLivePrice) && metaLivePrice > 0
          ? metaLivePrice
          : closes.length > 0
          ? closes[closes.length - 1]
          : 0;
      if (!lastPrice || lastPrice <= 0) continue;

      if (closes.length > 0 && Math.abs(closes[closes.length - 1] - lastPrice) > 1e-6) {
        closes[closes.length - 1] = lastPrice;
      }

      const metaChangePct = Number(
        result?.meta?.regularMarketChangePercent ??
        result?.meta?.fulldayChangePercent ??
        NaN
      );
      const dailyPrevClose =
        closes.length >= 2
          ? closes[closes.length - 2] !== lastPrice
            ? closes[closes.length - 2]
            : closes.length >= 3
            ? closes[closes.length - 3]
            : closes[closes.length - 2]
          : lastPrice;
      const metaPrevClose = Number(result?.meta?.previousClose ?? 0);
      const prevClose =
        Number.isFinite(metaPrevClose) && metaPrevClose > 0 && metaPrevClose !== lastPrice
          ? metaPrevClose
          : dailyPrevClose;
      const change1D = Number.isFinite(metaChangePct)
        ? Number(metaChangePct.toFixed(2))
        : prevClose > 0
        ? Number((((lastPrice - prevClose) / prevClose) * 100).toFixed(2))
        : 0;
      return {
        symbol,
        lastPrice,
        change1D,
        closes: closes.length >= 2 ? closes.slice(-35) : [prevClose, lastPrice],
        shortName: result?.meta?.longName || result?.meta?.shortName
      };
    } catch {
      // try next host
    }
  }
  return null;
}

async function fetchSparkChunk(chunk, range = '3mo', chunkIdx = 0) {
  const resultMap = {};
  const host = chunkIdx % 2 === 0 ? 'query1.finance.yahoo.com' : 'query2.finance.yahoo.com';
  const joined = chunk.map((s) => encodeURIComponent(s)).join(',');
  const sparkUrl = `https://${host}/v8/finance/spark?symbols=${joined}&range=${encodeURIComponent(range)}&interval=1d`;

  try {
    const sparkData = await fetchJson(sparkUrl, 8000);
    if (sparkData && typeof sparkData === 'object') {
      for (const sym of chunk) {
        const entry = sparkData[sym];
        const rawCloses = entry?.close || [];
        const closes = rawCloses
          .filter((c) => typeof c === 'number' && Number.isFinite(c) && c > 0)
          .map((c) => Number(c));
        const liveFieldPrice = Number(
          entry?.regularMarketPrice ??
          entry?.fulldayPrice ??
          entry?.currentPrice ??
          0
        );
        const lastPrice =
          Number.isFinite(liveFieldPrice) && liveFieldPrice > 0
            ? liveFieldPrice
            : closes.length > 0
            ? closes[closes.length - 1]
            : 0;

        if (lastPrice > 0 && (closes.length >= 2 || Number.isFinite(liveFieldPrice))) {
          if (closes.length > 0 && Math.abs(closes[closes.length - 1] - lastPrice) > 1e-6) {
            closes[closes.length - 1] = lastPrice;
          }
          const rawChangePct = Number(
            entry?.regularMarketChangePercent ??
            entry?.fulldayChangePercent ??
            NaN
          );
          const dailyPrevClose =
            closes.length >= 2
              ? closes[closes.length - 2] !== lastPrice
                ? closes[closes.length - 2]
                : closes.length >= 3
                ? closes[closes.length - 3]
                : closes[closes.length - 2]
              : lastPrice;
          const entryPrevClose = Number(entry?.previousClose ?? 0);
          const prevClose =
            Number.isFinite(entryPrevClose) && entryPrevClose > 0 && entryPrevClose !== lastPrice
              ? entryPrevClose
              : dailyPrevClose;
          const change1D = Number.isFinite(rawChangePct)
            ? Number(rawChangePct.toFixed(2))
            : prevClose > 0
            ? Number((((lastPrice - prevClose) / prevClose) * 100).toFixed(2))
            : 0;
          resultMap[sym] = {
            symbol: sym,
            lastPrice,
            change1D,
            closes: closes.length >= 2 ? closes.slice(-35) : [prevClose, lastPrice]
          };
        }
      }
    }
  } catch {
    // fallback below
  }

  const missing = chunk.filter((s) => !resultMap[s]);
  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (sym, idx) => {
        const single = await fetchSingleChart(sym, range, chunkIdx + idx);
        if (single) resultMap[sym] = single;
      })
    );
  }
  return resultMap;
}

function decodeHtmlEntities(input) {
  if (!input) return '';
  const namedMap = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&mdash;': '\u2014',
    '&ndash;': '\u2013',
    '&hellip;': '\u2026',
    '&lt;': '<',
    '&gt;': '>'
  };
  let text = String(input);
  for (let pass = 0; pass < 2; pass++) {
    text = text
      .replace(/&(nbsp|amp|quot|apos|lsquo|rsquo|ldquo|rdquo|mdash|ndash|hellip|lt|gt);/gi, (m) => namedMap[m.toLowerCase()] ?? m)
      .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
        const code = parseInt(hex, 16);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
      })
      .replace(/&#(\d+);/g, (_m, dec) => {
        const code = parseInt(dec, 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
      });
  }
  return text;
}

function stripTags(raw) {
  const withoutCdata = String(raw || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntities(withoutCdata).replace(/\s+/g, ' ').trim();
}

function extractXmlTag(block, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  return match ? stripTags(match[1]) : '';
}

async function fetchRssXmlDirect(rssUrl, sourceLabel, region, limit = 4) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(rssUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const xml = await res.text();
    const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
    return itemMatches.slice(0, limit).map((itemXml, idx) => {
      const title = extractXmlTag(itemXml, 'title') || 'Market Update';
      const link = extractXmlTag(itemXml, 'link') || 'https://www.idx.co.id';
      const pubDate = (extractXmlTag(itemXml, 'pubDate') || 'Hari ini · Live RSS').slice(0, 22);
      const desc = extractXmlTag(itemXml, 'description').slice(0, 175);
      return {
        id: `${region.toLowerCase()}_snap_${Date.now()}_${idx}`,
        title,
        source: sourceLabel,
        publishedAt: pubDate,
        url: link,
        region,
        summary: desc ? `${desc}...` : undefined
      };
    });
  } catch {
    return [];
  }
}

async function main() {
  const discoveredTickers = await discoverLiveIdxScreenerTickers();
  const uniqueIdxTickers = Array.from(
    new Set([
      ...REAL_IDX_TICKERS.map((t) => t.trim().toUpperCase()),
      ...discoveredTickers.map((d) => d.ticker)
    ])
  ).filter((t) => t.length === 4);

  const allSymbols = [
    ...MACRO_SYMBOLS,
    ...uniqueIdxTickers.map((t) => `${t}.JK`)
  ];

  const CHUNK_SIZE = 18;
  const chunks = [];
  for (let i = 0; i < allSymbols.length; i += CHUNK_SIZE) {
    chunks.push(allSymbols.slice(i, i + CHUNK_SIZE));
  }

  console.log(`Fetching Yahoo Finance Spark series for ${allSymbols.length} real BEI (.JK) + Macro symbols...`);

  const sparkData = {};
  const CONCURRENCY = 8;
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batchChunks = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batchChunks.map((c, idx) => fetchSparkChunk(c, '3mo', i + idx))
    );
    for (const map of results) {
      Object.assign(sparkData, map);
    }
  }

  const liveFetchedCount = Object.keys(sparkData).length;

  const newsResults = await Promise.all([
    fetchRssXmlDirect('https://www.cnbcindonesia.com/market/rss', 'CNBC Indonesia Market', 'DOMESTIC', 4),
    fetchRssXmlDirect('https://www.antaranews.com/rss/ekonomi.xml', 'Antara Ekonomi Nasional', 'DOMESTIC', 3),
    fetchRssXmlDirect('https://feeds.content.dowjones.io/public/rss/mw_topstories', 'MarketWatch Global Wire', 'GLOBAL', 4),
    fetchRssXmlDirect('https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', 'CNBC Global Finance', 'GLOBAL', 3)
  ]);

  const newsItems = newsResults.flat();

  // Check if data/nostradamus_cloud_state.json has an encryptedVault and verify against GITHUB_REPOSITORY for fork isolation
  // Also refresh stock prices & macro indicators inside data/nostradamus_cloud_state.json while preserving portfolio & vault
  let verifiedEncryptedVault = undefined;
  const cloudStatePath = path.resolve(__dirname, '../data/nostradamus_cloud_state.json');
  if (fs.existsSync(cloudStatePath)) {
    try {
      const rawCloud = JSON.parse(fs.readFileSync(cloudStatePath, 'utf-8'));
      const vault = rawCloud?.encryptedVault;
      const ghRepo = (process.env.GITHUB_REPOSITORY || '').trim().toLowerCase();
      if (vault && typeof vault === 'object') {
        if (ghRepo) {
          const expectedScopeHash = crypto
            .createHash('sha256')
            .update(`nostradamus-vault-scope-v2::${ghRepo}`)
            .digest('hex');
          if (vault.scopeHash === expectedScopeHash) {
            verifiedEncryptedVault = vault;
          } else {
            // Running inside a forked repository: strip inherited parent encryptedVault so fork defaults to 12345
            delete rawCloud.encryptedVault;
            console.log('Cleared inherited upstream encryptedVault on forked repository build.');
          }
        } else if (vault.scopeHash || vault.originHash) {
          verifiedEncryptedVault = vault;
        }
      }

      const nowIso = new Date().toISOString();
      const nowTimeWib =
        new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Jakarta'
        }) + ' WIB';

      if (Array.isArray(rawCloud?.stocks)) {
        rawCloud.stocks = rawCloud.stocks.map((st) => {
          const yfSym = `${String(st.ticker || '').toUpperCase()}.JK`;
          const liveItem = sparkData[yfSym];
          if (liveItem && liveItem.lastPrice > 0) {
            return {
              ...st,
              lastPrice: Math.round(liveItem.lastPrice),
              change1D: liveItem.change1D,
              dataSource: 'LIVE_API',
              lastSyncedAt: nowTimeWib
            };
          }
          return st;
        });
      }

      if (sparkData['^JKSE'] && sparkData['^JKSE'].lastPrice > 0) {
        rawCloud.liveIhsgQuote = {
          lastPrice: Number(sparkData['^JKSE'].lastPrice.toFixed(2)),
          change1D: sparkData['^JKSE'].change1D
        };
      }

      rawCloud.savedAt = nowIso;
      fs.writeFileSync(cloudStatePath, JSON.stringify(rawCloud, null, 2));
    } catch {
      // ignore optional cloudState read/write error
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    liveYahooSymbolCount: liveFetchedCount,
    symbolCount: Object.keys(sparkData).length,
    totalJciEmitenCount: Math.max(956, uniqueIdxTickers.length),
    discoveredTickers,
    data: sparkData,
    newsItems,
    ...(verifiedEncryptedVault ? { encryptedVault: verifiedEncryptedVault } : {})
  };

  const jsonString = JSON.stringify(payload);

  // Write to 4 locations so it is embedded in app.js, served from /public, /docs, AND repo root /
  const srcDataOut = path.resolve(__dirname, '../src/data/staticMarketSnapshot.json');
  const publicOut = path.resolve(__dirname, '../public/static-market-snapshot.json');
  const docsOut = path.resolve(__dirname, '../docs/static-market-snapshot.json');
  const rootOut = path.resolve(__dirname, '../static-market-snapshot.json');

  fs.writeFileSync(srcDataOut, jsonString);
  fs.writeFileSync(publicOut, jsonString);
  if (fs.existsSync(path.dirname(docsOut))) {
    fs.writeFileSync(docsOut, jsonString);
  }
  fs.writeFileSync(rootOut, jsonString);

  console.log(
    `Saved ${liveFetchedCount} live Yahoo Finance symbols (${Object.keys(sparkData).length} total hydrated JCI + Macro symbols) and ${newsItems.length} news items to src/data, public/, docs/, and root.`
  );
}

main().catch((err) => {
  console.error('Snapshot generation warning:', err);
  process.exit(0);
});
