/**
 * Official IDX & KSEI High Shareholding Concentration (HSC) Registry
 * Reference:
 * - Pengumuman BEI No. Peng-HSC-00088/BEI.WAS/11-2026
 * - Pengumuman KSEI No. Peng-00032/PWS/KSEI/1126
 * Evaluation Cut-off: 30 Oktober 2026 (Diumumkan: 11 November 2026)
 * Criteria: Kumulatif kepemilikan sampai dengan 10 pemegang saham terbesar tanpa warkat (scripless)
 * ditambah kepemilikan dengan warkat (scrip) >= 92,5% (beserta catatan khusus *, **, ***).
 */

export type KseiHscFootnote =
  | 'NONE'
  | 'UNREPORTED_DISTRIBUTION' // * Belum menyampaikan informasi penurunan konsentrasi via Pasar Reguler/Tunai
  | 'REPO_TRANSACTION'        // ** Penurunan kepemilikan terjadi melalui transaksi repo saham
  | 'VOLUNTARY_DELISTING';    // *** Dalam proses voluntary delisting

export interface KseiHscEntry {
  no: number;
  ticker: string;
  companyName: string;
  top10ConcentrationPct: number;
  impliedPublicFloatMaxPct: number;
  isNew: boolean; // true = "Baru/New", false = "-" (Eksisting)
  footnote: KseiHscFootnote;
}

/**
 * Compact tuple representation of the 383 listed companies from Attachment Peng-HSC-00088/BEI.WAS/11-2026:
 * [no, ticker, companyName, top10ConcentrationPct, isNew (1=Baru/New, 0=-), footnote ('' | '*' | '**' | '***')]
 */
const RAW_KSEI_HSC_TUPLES: Array<[number, string, string, number, 0 | 1, '' | '*' | '**' | '***']> = [
  // Page 3 (No. 1 - 41)
  [1, 'ABDA', 'PT Asuransi Bina Dana Arta Tbk', 99.948, 1, ''],
  [2, 'ACST', 'PT Acset Indonusa Tbk', 93.547, 1, ''],
  [3, 'ADCP', 'PT Adhi Commuter Properti Tbk', 93.797, 1, ''],
  [4, 'ADES', 'PT Akasha Wira International Tbk', 95.105, 0, ''],
  [5, 'ADMF', 'PT Adira Dinamika Multi Finance Tbk', 92.744, 1, ''],
  [6, 'ADMG', 'PT Polychem Indonesia Tbk', 92.877, 1, ''],
  [7, 'AGAR', 'PT Asia Sejahtera Mina Tbk', 98.304, 0, ''],
  [8, 'AGII', 'PT Samator Indo Gas Tbk', 98.580, 0, ''],
  [9, 'AGRS', 'PT Bank IBK Indonesia Tbk', 96.716, 1, ''],
  [10, 'AKPI', 'PT Argha Karya Prima Ind. Tbk', 94.023, 1, ''],
  [11, 'AKSI', 'PT Mineral Sumberdaya Mandiri Tbk', 97.810, 1, ''],
  [12, 'ALII', 'PT Ancara Logistics Indonesia Tbk', 97.710, 0, ''],
  [13, 'ALKA', 'PT Alakasa Industrindo Tbk', 97.790, 0, ''],
  [14, 'ALMI', 'PT Alumindo Light Metal Industry Tbk', 99.225, 1, ''],
  [15, 'AMAG', 'PT Asuransi Multi Artha Guna Tbk', 98.867, 1, ''],
  [16, 'AMAN', 'PT Makmur Berkah Amanda Tbk', 99.105, 1, ''],
  [17, 'AMAR', 'PT Bank Amar Indonesia Tbk', 97.604, 1, ''],
  [18, 'AMFG', 'PT Asahimas Flat Glass Tbk', 94.971, 1, ''],
  [19, 'AMOR', 'PT Ashmore Asset Management Indonesia Tbk', 95.075, 1, ''],
  [20, 'ANJT', 'PT Austindo Nusantara Jaya Tbk', 99.132, 1, ''],
  [21, 'APII', 'PT Arita Prima Indonesia Tbk', 97.670, 1, ''],
  [22, 'APLI', 'PT Asiaplast Industries Tbk', 97.223, 1, ''],
  [23, 'AREA', 'PT Dunia Virtual Online Tbk', 97.088, 1, ''],
  [24, 'ARGO', 'PT Argo Pantes Tbk', 99.599, 1, ''],
  [25, 'ARTA', 'PT Arthavest Tbk', 99.845, 1, ''],
  [26, 'ASBI', 'PT Asuransi Bintang Tbk', 96.657, 1, ''],
  [27, 'ASDM', 'PT Asuransi Dayin Mitra Tbk', 96.669, 1, ''],
  [28, 'ASRM', 'PT Asuransi Ramayana Tbk', 96.470, 1, ''],
  [29, 'AWAN', 'PT Era Digital Media Tbk', 95.082, 1, ''],
  [30, 'AXIO', 'PT Tera Data Indonusa Tbk', 97.153, 1, ''],
  [31, 'BABY', 'PT Multitrend Indo Tbk', 96.953, 1, ''],
  [32, 'BAJA', 'PT Saranacentral Bajatama Tbk', 95.706, 0, ''],
  [33, 'BALI', 'PT Bali Towerindo Sentra Tbk', 93.431, 0, ''],
  [34, 'BATA', 'PT Sepatu Bata Tbk', 97.146, 1, ''],
  [35, 'BATR', 'PT Benteng Api Technic Tbk', 93.151, 1, ''],
  [36, 'BBHI', 'PT Allo Bank Indonesia Tbk', 94.976, 0, ''],
  [37, 'BBLD', 'PT Buana Finance Tbk', 96.629, 1, ''],
  [38, 'BBMD', 'PT Bank Mestika Dharma Tbk', 99.258, 0, ''],
  [39, 'BBRM', 'PT Pelayaran Nasional Bina Buana Raya Tbk', 95.148, 1, ''],
  [40, 'BBSI', 'PT Krom Bank Indonesia Tbk', 99.940, 0, ''],
  [41, 'BBSS', 'PT Bumi Benowo Sukses Sejahtera Tbk', 94.028, 1, ''],

  // Page 4 (No. 42 - 90)
  [42, 'BCIC', 'PT Bank JTrust Indonesia Tbk', 98.739, 1, ''],
  [43, 'BDKR', 'PT Berdikari Pondasi Perkasa Tbk', 92.553, 0, ''],
  [44, 'BDMN', 'PT Bank Danamon Indonesia Tbk', 96.113, 1, ''],
  [45, 'BELI', 'PT Global Digital Niaga Tbk', 93.834, 0, ''],
  [46, 'BESS', 'PT Batulicin Nusantara Maritim Tbk', 98.742, 1, ''],
  [47, 'BIKA', 'PT Binakarya Jaya Abadi Tbk', 94.915, 1, ''],
  [48, 'BIKE', 'PT Bhineka Inovasi Ketahanan Energi Tbk', 93.085, 0, ''],
  [49, 'BIMA', 'PT Primarindo Asia Infrastructure Tbk', 93.809, 1, ''],
  [50, 'BINA', 'PT Bank Ina Perdana Tbk', 94.113, 0, ''],
  [51, 'BINO', 'PT Perma Plasindo Tbk', 96.168, 1, ''],
  [52, 'BKDP', 'PT Bukit Darmo Property Tbk', 95.680, 0, ''],
  [53, 'BKSW', 'PT Bank QNB Indonesia Tbk', 97.249, 1, ''],
  [54, 'BLES', 'PT Superior Prima Sukses Tbk', 97.149, 1, ''],
  [55, 'BLOG', 'PT Trimitra Trans Persada Tbk', 93.193, 1, ''],
  [56, 'BLTZ', 'PT Graha Layar Prima Tbk', 99.971, 1, ''],
  [57, 'BLUE', 'PT Berkah Prima Perkasa Tbk', 94.457, 1, ''],
  [58, 'BMAS', 'PT Bank Kasikorn Indonesia Tbk', 99.916, 0, ''],
  [59, 'BNBA', 'PT Bank Bumi Arta Tbk', 94.895, 1, ''],
  [60, 'BNGA', 'PT Bank CIMB Niaga Tbk', 94.691, 1, ''],
  [61, 'BNII', 'PT Bank Maybank Indonesia Tbk', 99.137, 0, ''],
  [62, 'BNLI', 'PT Bank Permata Tbk', 99.917, 0, ''],
  [63, 'BOAT', 'PT Newport Marine Services Tbk', 92.786, 1, ''],
  [64, 'BOBA', 'PT Formosa Ingredient Factory Tbk', 95.256, 1, ''],
  [65, 'BOLT', 'PT Garuda Metalindo Tbk', 99.781, 1, ''],
  [66, 'BPFI', 'PT Woori Finance Indonesia Tbk', 99.230, 1, ''],
  [67, 'BPII', 'PT Batavia Prosperindo Internasional Tbk', 99.985, 1, ''],
  [68, 'BPTR', 'PT Batavia Prosperindo Trans Tbk', 95.977, 1, ''],
  [69, 'BRAM', 'PT Indo Kordsa Tbk', 99.650, 1, ''],
  [70, 'BREN', 'PT Barito Renewables Energy Tbk', 96.693, 0, ''],
  [71, 'BRIS', 'PT Bank Syariah Indonesia (Persero) Tbk', 93.024, 1, ''],
  [72, 'BRNA', 'PT Berlina Tbk', 93.984, 1, ''],
  [73, 'BSSR', 'PT Baramulti Suksessarana Tbk', 94.169, 1, ''],
  [74, 'BSWD', 'PT Bank of India Indonesia Tbk', 99.948, 0, ''],
  [75, 'BTON', 'PT Betonjaya Manunggal Tbk', 98.877, 1, ''],
  [76, 'BTPN', 'PT Bank SMBC Indonesia Tbk', 99.779, 0, ''],
  [77, 'BUAH', 'PT Segar Kumala Indonesia Tbk', 95.349, 1, ''],
  [78, 'BUDI', 'PT Budi Starch & Sweetener Tbk', 96.661, 1, ''],
  [79, 'BUKK', 'PT Bukaka Teknik Utama Tbk', 97.664, 1, ''],
  [80, 'BYAN', 'PT Bayan Resources Tbk', 96.500, 0, ''],
  [81, 'CAKK', 'PT Cahayaputra Asa Keramik Tbk', 94.334, 1, ''],
  [82, 'CAMP', 'PT Campina Ice Cream Industry Tbk', 96.625, 1, ''],
  [83, 'CANI', 'PT Capitol Nusantara Indonesia Tbk', 95.590, 1, ''],
  [84, 'CASH', 'PT Cashlez Worldwide Indonesia Tbk', 93.254, 1, ''],
  [85, 'CASS', 'PT Cahaya Aero Services Tbk', 95.653, 1, ''],
  [86, 'CBPE', 'PT Citra Buana Prasida Tbk', 99.495, 1, ''],
  [87, 'CBUT', 'PT Citra Borneo Utama Tbk', 99.470, 1, ''],
  [88, 'CCSI', 'PT Communication Cable Systems Indonesia Tbk', 93.457, 1, ''],
  [89, 'CDIA', 'PT Chandra Daya Investasi Tbk', 94.304, 1, ''],
  [90, 'CEKA', 'PT Wilmar Cahaya Indonesia Tbk', 96.764, 1, ''],

  // Page 5 (No. 91 - 138)
  [91, 'CENT', 'PT Centratama Telekomunikasi Indonesia Tbk', 96.905, 1, ''],
  [92, 'CITA', 'PT Cita Mineral Investindo Tbk', 99.160, 0, ''],
  [93, 'CITY', 'PT Natura City Developments Tbk', 98.773, 1, ''],
  [94, 'CLAY', 'PT Citra Putra Realty Tbk', 99.890, 0, ''],
  [95, 'CLEO', 'PT Sariguna Primatirta Tbk', 92.552, 1, ''],
  [96, 'CMNP', 'PT Citra Marga Nusaphala Persada Tbk', 98.000, 0, ''],
  [97, 'CMNT', 'PT Cemindo Gemilang Tbk', 99.297, 0, ''],
  [98, 'CMPP', 'PT AirAsia Indonesia Tbk', 98.475, 1, ''],
  [99, 'CNMA', 'PT Nusantara Sejahtera Raya Tbk', 95.614, 1, ''],
  [100, 'CRAB', 'PT Toba Surimi Industries Tbk', 98.767, 1, ''],
  [101, 'CRSN', 'PT Carsurin Tbk', 97.416, 1, ''],
  [102, 'CSAP', 'PT Catur Sentosa Adiprana Tbk', 98.262, 1, ''],
  [103, 'CSRA', 'PT Cisadane Sawit Raya Tbk', 93.705, 1, ''],
  [104, 'CTBN', 'PT Citra Tubindo Tbk', 99.679, 1, ''],
  [105, 'DAAZ', 'PT Daaz Bara Lestari Tbk', 96.577, 1, ''],
  [106, 'DART', 'PT Duta Anggada Realty Tbk', 97.763, 1, ''],
  [107, 'DAYA', 'PT Duta Intidaya Tbk', 99.748, 1, ''],
  [108, 'DCII', 'PT DCI Indonesia Tbk', 99.960, 0, ''],
  [109, 'DEPO', 'PT Caturkarda Depo Bangunan Tbk', 98.583, 1, ''],
  [110, 'DGWG', 'PT Delta Giri Wacana Tbk', 95.685, 0, ''],
  [111, 'DLTA', 'PT Delta Djakarta Tbk', 92.720, 1, ''],
  [112, 'DMND', 'PT Diamond Food Indonesia Tbk', 99.863, 0, ''],
  [113, 'DNAR', 'PT Bank Oke Indonesia Tbk', 98.307, 1, ''],
  [114, 'DNET', 'PT Indoritel Makmur Internasional Tbk', 98.057, 0, ''],
  [115, 'DSSA', 'PT Dian Swastatika Sentosa Tbk', 93.221, 0, ''],
  [116, 'DUTI', 'PT Duta Pertiwi Tbk', 99.879, 0, ''],
  [117, 'DVLA', 'PT Darya-Varia Laboratoria Tbk', 98.325, 1, ''],
  [118, 'DWGL', 'PT Dwi Guna Laksana Tbk', 96.481, 1, ''],
  [119, 'ECII', 'PT Electronic City Indonesia Tbk', 94.631, 1, ''],
  [120, 'EDGE', 'PT Indointernet Tbk', 99.993, 1, '***'],
  [121, 'EKAD', 'PT Ekadharma International Tbk', 96.181, 1, ''],
  [122, 'ELPI', 'PT Pelayaran Nasional Ekalya Purnamasari Tbk', 98.605, 0, ''],
  [123, 'EMDE', 'PT Megapolitan Developments Tbk', 93.201, 1, ''],
  [124, 'ENAK', 'PT Champ Resto Indonesia Tbk', 97.636, 1, ''],
  [125, 'EPMT', 'PT Enseval Putera Megatrading Tbk', 99.016, 0, ''],
  [126, 'ERTX', 'PT Eratex Djaja Tbk', 94.732, 1, ''],
  [127, 'ESTA', 'PT Esta Multi Usaha Tbk', 96.880, 1, ''],
  [128, 'ESTI', 'PT Ever Shine Textile Industry Tbk', 94.833, 1, ''],
  [129, 'ETWA', 'PT Eterindo Wahanatama Tbk', 95.255, 1, ''],
  [130, 'FAPA', 'PT FAP Agri Tbk', 99.724, 0, ''],
  [131, 'FAST', 'PT Fast Food Indonesia Tbk', 93.528, 1, ''],
  [132, 'FASW', 'PT Fajar Surya Wisesa Tbk', 99.988, 1, ''],
  [133, 'FILM', 'PT MD Entertainment Tbk', 90.754, 0, '**'],
  [134, 'FISH', 'PT FKS Multi Agro Tbk', 99.679, 1, ''],
  [135, 'FITT', 'PT Fortune Resources Investment Tbk', 94.654, 0, ''],
  [136, 'FMII', 'PT Fortune Mate Indonesia Tbk', 99.186, 1, ''],
  [137, 'FOOD', 'PT Sentra Food Indonesia Tbk', 96.399, 1, ''],
  [138, 'FORE', 'PT Fore Kopi Indonesia Tbk', 98.170, 1, ''],

  // Page 6 (No. 139 - 186)
  [139, 'FORU', 'PT Fortune Indonesia Tbk', 97.880, 1, ''],
  [140, 'FPNI', 'PT Lotte Chemical Titan Tbk', 94.387, 1, ''],
  [141, 'GDST', 'PT Gunawan Dianjaya Steel Tbk', 97.622, 1, ''],
  [142, 'GDYR', 'PT Goodyear Indonesia Tbk', 98.373, 1, ''],
  [143, 'GEMS', 'PT Golden Energy Mines Tbk', 99.239, 0, ''],
  [144, 'GGRP', 'PT Gunung Raja Paksi Tbk', 97.362, 1, ''],
  [145, 'GHON', 'PT Gihon Telekomunikasi Indonesia Tbk', 99.361, 1, ''],
  [146, 'GIAA', 'PT Garuda Indonesia (Persero) Tbk', 96.049, 1, ''],
  [147, 'GLOB', 'PT Globe Kita Terang Tbk', 99.306, 1, ''],
  [148, 'GMFI', 'PT Garuda Maintenance Facility Aero Asia Tbk', 95.394, 1, ''],
  [149, 'GMTD', 'PT Gowa Makassar Tourism Development Tbk', 99.490, 1, ''],
  [150, 'GOLD', 'PT Visi Telekomunikasi Infrastruktur Tbk', 98.539, 1, ''],
  [151, 'GOLF', 'PT Intra GolfLink Resorts Tbk', 97.959, 1, ''],
  [152, 'GRIA', 'PT Ingria Pratama Capitalindo Tbk', 94.162, 1, ''],
  [153, 'GSMF', 'PT Equity Development Investment Tbk', 99.155, 1, ''],
  [154, 'GTBO', 'PT Garda Tujuh Buana Tbk', 97.850, 1, ''],
  [155, 'GTRA', 'PT Grahaprima Suksesmandiri Tbk', 95.323, 1, ''],
  [156, 'GUNA', 'PT Gunanusa Eramandiri Tbk', 96.680, 1, ''],
  [157, 'GWSA', 'PT Greenwood Sejahtera Tbk', 96.301, 1, ''],
  [158, 'HALO', 'PT Haloni Jane Tbk', 92.735, 1, ''],
  [159, 'HATM', 'PT Habco Trans Maritima Tbk', 96.567, 0, ''],
  [160, 'HDFA', 'PT Radana Bhaskara Finance Tbk', 98.892, 1, ''],
  [161, 'HERO', 'PT DFI Retail Nusantara Tbk', 99.101, 1, ''],
  [162, 'HITS', 'PT Humpuss Intermoda Transportasi Tbk', 99.988, 1, '***'],
  [163, 'HMSP', 'PT HM Sampoerna Tbk', 94.865, 1, ''],
  [164, 'HOMI', 'PT Grand House Mulia Tbk', 94.087, 1, ''],
  [165, 'HOTL', 'PT Saraswati Griya Lestari Tbk', 94.382, 1, ''],
  [166, 'HYGN', 'PT Ecocare Indo Pasifik Tbk', 94.287, 1, ''],
  [167, 'IBST', 'PT Inti Bangun Sejahtera Tbk', 99.992, 1, '***'],
  [168, 'IDPR', 'PT Indonesia Pondasi Raya Tbk', 97.381, 1, ''],
  [169, 'IFII', 'PT Indonesia Fibreboard Industry Tbk', 99.498, 1, ''],
  [170, 'IFSH', 'PT Ifishdeco Tbk', 99.699, 0, ''],
  [171, 'IGAR', 'PT Champion Pacific Indonesia Tbk', 94.948, 1, '***'],
  [172, 'IKBI', 'PT Sumi Indo Kabel Tbk', 97.527, 1, ''],
  [173, 'IKPM', 'PT Ikapharmindo Putramas Tbk', 95.639, 1, ''],
  [174, 'IMAS', 'PT Indomobil Sukses Internasional Tbk', 95.484, 1, ''],
  [175, 'IMJS', 'PT Indomobil Multi Jasa Tbk', 94.879, 1, ''],
  [176, 'INAF', 'PT Indofarma Tbk', 97.072, 1, ''],
  [177, 'INDO', 'PT Royalindo Investa Wijaya Tbk', 94.469, 0, ''],
  [178, 'INDR', 'PT Indo-Rama Synthetics Tbk', 96.416, 1, ''],
  [179, 'INDS', 'PT Indospring Tbk', 96.834, 1, ''],
  [180, 'INPP', 'PT Indonesian Paradise Property Tbk', 98.723, 0, ''],
  [181, 'INRU', 'PT Toba Pulp Lestari Tbk', 99.487, 1, ''],
  [182, 'INTD', 'PT Inter-Delta Tbk', 96.225, 1, ''],
  [183, 'IPAC', 'PT Era Graharealty Tbk', 99.221, 1, '***'],
  [184, 'IPCM', 'PT Jasa Armada Indonesia Tbk', 95.208, 1, ''],
  [185, 'IPOL', 'PT Indopoly Swakarsa Industry Tbk', 93.620, 1, ''],
  [186, 'JARR', 'PT Jhonlin Agro Raya Tbk', 98.020, 1, ''],

  // Page 7 (No. 187 - 235)
  [187, 'JAWA', 'PT Jaya Agra Wattie Tbk', 98.990, 1, ''],
  [188, 'JECC', 'PT Jembo Cable Company Tbk', 98.886, 1, ''],
  [189, 'JRPT', 'PT Jaya Real Property Tbk', 94.930, 1, ''],
  [190, 'JSPT', 'PT Jakarta Setiabudi Internasional Tbk', 99.809, 1, ''],
  [191, 'KAEF', 'PT Kimia Farma (Persero) Tbk', 95.687, 1, ''],
  [192, 'KBLM', 'PT Kabelindo Murni Tbk', 96.537, 1, ''],
  [193, 'KDSI', 'PT Kedawung Setia Industrial Tbk', 97.482, 1, ''],
  [194, 'KEJU', 'PT Mulia Boga Raya Tbk', 97.006, 1, ''],
  [195, 'KIAS', 'PT Keramika Indonesia Assosiasi Tbk', 97.320, 1, ''],
  [196, 'KING', 'PT Hoffmen Cleanindo Tbk', 98.022, 0, ''],
  [197, 'KINO', 'PT Kino Indonesia Tbk', 98.388, 1, ''],
  [198, 'KLIN', 'PT Klinko Karya Imaji Tbk', 96.258, 1, ''],
  [199, 'KMTR', 'PT Kirana Megatara Tbk', 99.583, 1, ''],
  [200, 'KOBX', 'PT Kobexindo Tractors Tbk', 95.853, 1, ''],
  [201, 'KOIN', 'PT Kokoh Inti Arebama Tbk', 98.244, 1, ''],
  [202, 'KONI', 'PT Perdana Bangun Pusaka Tbk', 95.079, 0, ''],
  [203, 'KOPI', 'PT Mitra Energi Persada Tbk', 93.769, 1, ''],
  [204, 'KSIX', 'PT Kentanix Supra International Tbk', 98.864, 1, ''],
  [205, 'LFLO', 'PT Imago Mulia Persada Tbk', 99.393, 1, ''],
  [206, 'LIFE', 'PT MSIG Life Insurance Indonesia Tbk', 99.150, 0, ''],
  [207, 'LINK', 'PT Link Net Tbk', 99.698, 1, ''],
  [208, 'LION', 'PT Lion Metal Works Tbk', 97.024, 1, ''],
  [209, 'LMPI', 'PT Langgeng Makmur Industri Tbk', 98.440, 1, ''],
  [210, 'LPCK', 'PT Lippo Cikarang Tbk', 93.464, 1, ''],
  [211, 'LPGI', 'PT Lippo General Insurance Tbk', 99.278, 1, ''],
  [212, 'LRNA', 'PT Eka Sari Lorena Transport Tbk', 95.043, 1, ''],
  [213, 'MAPB', 'PT Map Boga Adiperkasa Tbk', 99.761, 1, ''],
  [214, 'MAPI', 'PT Mitra Adiperkasa Tbk', 96.758, 1, ''],
  [215, 'MASB', 'PT Bank Multiarta Sentosa Tbk', 96.908, 1, ''],
  [216, 'MAYA', 'PT Bank Mayapada Internasional Tbk', 96.715, 0, ''],
  [217, 'MBAP', 'PT Mitrabara Adiperdana Tbk', 96.984, 1, ''],
  [218, 'MBSS', 'PT Mitrabahtera Segara Sejati Tbk', 96.775, 1, ''],
  [219, 'MCOL', 'PT Prima Andalan Mandiri Tbk', 98.648, 0, ''],
  [220, 'MCOR', 'PT Bank China Construction Bank Indonesia Tbk', 92.962, 1, ''],
  [221, 'MDIA', 'PT Intermedia Capital Tbk', 94.280, 0, ''],
  [222, 'MDKI', 'PT Emdeki Utama Tbk', 92.801, 1, ''],
  [223, 'MDLA', 'PT Medela Potentia Tbk', 94.944, 1, ''],
  [224, 'MEGA', 'PT Bank Mega Tbk', 95.683, 0, ''],
  [225, 'MERK', 'PT Merck Tbk', 95.766, 1, ''],
  [226, 'META', 'PT Nusantara Infrastructure Tbk', 99.638, 1, '***'],
  [227, 'MFMI', 'PT Multifiling Mitra Indonesia Tbk', 99.757, 1, ''],
  [228, 'MGNA', 'PT Magna Investama Mandiri Tbk', 93.696, 1, ''],
  [229, 'MGRO', 'PT Mahkota Group Tbk', 93.139, 0, ''],
  [230, 'MINE', 'PT Sinar Terang Mandiri Tbk', 96.491, 1, ''],
  [231, 'MKAP', 'PT Multikarya Asia Pasifik Raya Tbk', 95.604, 1, ''],
  [232, 'MKNT', 'PT Mitra Komunikasi Nusantara Tbk', 99.647, 0, ''],
  [233, 'MKPI', 'PT Metropolitan Kentjana Tbk', 97.733, 0, ''],
  [234, 'MKTR', 'PT Menthobi Karyatama Raya Tbk', 98.284, 1, ''],
  [235, 'MLBI', 'PT Multi Bintang Indonesia Tbk', 95.511, 1, ''],

  // Page 8 (No. 236 - 285)
  [236, 'MLIA', 'PT Mulia Industrindo Tbk', 94.528, 1, ''],
  [237, 'MLPT', 'PT Multipolar Technology Tbk', 99.406, 0, ''],
  [238, 'MMLP', 'PT Mega Manunggal Property Tbk', 95.418, 1, ''],
  [239, 'MOLI', 'PT Madusari Murni Indah Tbk', 92.996, 1, ''],
  [240, 'MORA', 'PT Ekamas Mora Republik', 95.652, 0, ''],
  [241, 'MPRO', 'PT Maha Properti Indonesia Tbk', 99.993, 0, ''],
  [242, 'MPXL', 'PT MPX Logistics International Tbk', 93.378, 1, ''],
  [243, 'MSJA', 'PT Multi Spunindo Jaya Tbk', 98.674, 0, ''],
  [244, 'MSTI', 'PT Mastersystem Infotama Tbk', 93.048, 1, ''],
  [245, 'MTEL', 'PT Dayamitra Telekomunikasi Tbk', 95.602, 0, ''],
  [246, 'MTMH', 'PT Murni Sadar Tbk', 98.184, 1, ''],
  [247, 'MTSM', 'PT Metro Realty Tbk', 97.377, 1, ''],
  [248, 'MTWI', 'PT Malacca Trust Wuwungan Insurance Tbk', 99.245, 1, ''],
  [249, 'MYOH', 'PT Samindo Resources Tbk', 93.225, 1, ''],
  [250, 'MYTX', 'PT Asia Pacific Investama Tbk', 98.289, 1, ''],
  [251, 'NCKL', 'PT Trimegah Bangun Persada Tbk', 92.665, 1, ''],
  [252, 'NELY', 'PT Pelayaran Nelly Dwi Putri Tbk', 94.832, 1, ''],
  [253, 'NEST', 'PT Esta Indonesia Tbk', 96.393, 1, ''],
  [254, 'NETV', 'PT MDTV Media Technologies Tbk', 96.309, 1, ''],
  [255, 'NICE', 'PT Adhi Kartiko Pratama Tbk', 96.796, 1, ''],
  [256, 'NICK', 'PT Charnic Capital Tbk', 99.245, 0, ''],
  [257, 'NISP', 'PT Bank OCBC NISP Tbk', 92.931, 1, ''],
  [258, 'NOBU', 'PT Bank Nationalnobu Tbk', 93.292, 1, ''],
  [259, 'NZIA', 'PT Nusantara Almazia, Tbk', 94.274, 1, ''],
  [260, 'OCAP', 'PT ONIX CAPITAL Tbk', 99.998, 1, '***'],
  [261, 'OMED', 'PT Jayamas Medica Industri Tbk', 98.546, 1, ''],
  [262, 'OMRE', 'PT Indonesia Prima Property Tbk', 97.897, 1, ''],
  [263, 'PALM', 'PT Provident Investasi Bersama Tbk', 98.293, 1, ''],
  [264, 'PANI', 'PT Pantai Indah Kapuk Dua Tbk', 95.057, 1, ''],
  [265, 'PANR', 'PT Panorama Sentrawisata Tbk', 94.011, 1, ''],
  [266, 'PBID', 'PT Panca Budi Idaman Tbk', 92.686, 1, ''],
  [267, 'PBSA', 'PT Paramita Bangun Sarana Tbk', 94.223, 1, ''],
  [268, 'PDES', 'PT Destinasi Tirta Nusantara Tbk', 96.791, 1, ''],
  [269, 'PDPP', 'PT Primadaya Plastisindo Tbk', 94.672, 1, ''],
  [270, 'PEVE', 'PT Penta Valent Tbk', 93.947, 1, ''],
  [271, 'PGEO', 'PT Pertamina Geothermal Energy Tbk', 95.225, 1, ''],
  [272, 'PGUN', 'PT Pradiksi Gunatama Tbk', 99.956, 0, ''],
  [273, 'PJAA', 'PT Pembangunan Jaya Ancol Tbk', 95.258, 1, ''],
  [274, 'PLIN', 'PT Plaza Indonesia Realty Tbk', 99.803, 1, ''],
  [275, 'PMJS', 'PT Putra Mandiri Jembar Tbk', 99.212, 1, ''],
  [276, 'PMUI', 'PT Prima Multi Usaha Indonesia Tbk', 95.069, 1, ''],
  [277, 'PNBS', 'PT Bank Panin Dubai Syariah Tbk', 93.667, 1, ''],
  [278, 'PNGO', 'PT AEP Pinago Plantations Tbk', 99.883, 1, ''],
  [279, 'PNSE', 'PT Pudjiadi & Sons Tbk', 96.485, 1, ''],
  [280, 'POLI', 'PT Pollux Hotels Group Tbk', 99.774, 1, ''],
  [281, 'POLL', 'PT Pollux Properties Indonesia Tbk', 99.333, 1, ''],
  [282, 'POLU', 'PT Golden Flower Tbk', 99.934, 0, ''],
  [283, 'PORT', 'PT Nusantara Pelabuhan Handal Tbk', 99.808, 1, ''],
  [284, 'PRAY', 'PT Famon Awal Bros Sedaya Tbk', 99.837, 0, ''],
  [285, 'PSAB', 'PT J RESOURCES ASIA PASIFIK Tbk', 95.816, 0, ''],

  // Page 9 (No. 286 - 333)
  [286, 'PSAT', 'PT Pancaran Samudera Transport Tbk', 96.705, 1, ''],
  [287, 'PSDN', 'PT Prasidha Aneka Niaga Tbk', 93.638, 1, ''],
  [288, 'PSGO', 'PT Palma Serasih Tbk', 99.389, 1, ''],
  [289, 'PSSI', 'PT IMC Pelita Logistik Tbk', 97.982, 1, ''],
  [290, 'PTIS', 'PT Indo Straits Tbk', 92.865, 1, ''],
  [291, 'PTMR', 'PT Master Print Tbk', 95.696, 1, ''],
  [292, 'PTPW', 'PT Pratama Widya Tbk', 99.914, 1, ''],
  [293, 'PTSN', 'PT Sat Nusapersada Tbk', 97.673, 1, ''],
  [294, 'RAAM', 'PT Tripar Multivision Plus Tbk', 92.875, 1, ''],
  [295, 'RANC', 'PT Supra Boga Lestari Tbk', 98.087, 1, ''],
  [296, 'RDTX', 'PT Roda Vivatex Tbk', 95.561, 1, ''],
  [297, 'RELI', 'PT Reliance Sekuritas Indonesia Tbk', 99.507, 1, ''],
  [298, 'RISE', 'PT Jaya Sukses Makmur Sentosa Tbk', 97.227, 0, ''],
  [299, 'RLCO', 'PT Abadi Lestari Indonesia Tbk', 96.145, 0, ''],
  [300, 'ROCK', 'PT Rockfields Properti Indonesia Tbk', 98.913, 0, ''],
  [301, 'RODA', 'PT Pikko Land Development Tbk', 92.829, 1, ''],
  [302, 'RONY', 'PT Aracord Nusantara Group Tbk', 98.761, 1, ''],
  [303, 'ROTI', 'PT Nippon Indosari Corpindo Tbk', 97.048, 1, ''],
  [304, 'RSCH', 'PT Charlie Hospital Semarang Tbk', 92.531, 1, ''],
  [305, 'RSGK', 'PT Kedoya Adyaraya Tbk', 98.464, 1, ''],
  [306, 'SAFE', 'PT Steady Safe Tbk', 97.814, 0, ''],
  [307, 'SAME', 'PT Sarana Meditama Metropolitan Tbk', 94.939, 0, ''],
  [308, 'SAMF', 'PT Saraswanti Anugerah Makmur Tbk', 98.698, 1, ''],
  [309, 'SAPX', 'PT Satria Antaran Prima Tbk', 95.866, 1, ''],
  [310, 'SATU', 'PT Kota Satu Properti Tbk', 91.288, 0, '*'],
  [311, 'SCCO', 'PT Supreme Cable Manufacturing & Commerce Tbk', 95.488, 1, ''],
  [312, 'SCNP', 'PT Selaras Citra Nusantara Perkasa Tbk', 98.812, 1, ''],
  [313, 'SCPI', 'PT Organon Pharma Indonesia Tbk', 99.988, 1, '***'],
  [314, 'SDPC', 'PT Millennium Pharmacon International Tbk', 94.178, 1, ''],
  [315, 'SDRA', 'PT Bank Woori Saudara Indonesia 1906 Tbk', 99.066, 1, ''],
  [316, 'SGRO', 'PT Prime Agri Resources Tbk', 99.065, 1, ''],
  [317, 'SHID', 'PT Hotel Sahid Jaya Tbk', 99.352, 1, ''],
  [318, 'SHIP', 'PT Sillo Maritime Perdana Tbk', 98.297, 0, ''],
  [319, 'SILO', 'PT Siloam International Hospitals Tbk', 96.782, 0, ''],
  [320, 'SIPD', 'PT Sreeya Sewu Indonesia Tbk', 97.888, 1, ''],
  [321, 'SKBM', 'PT Sekar Bumi Tbk', 96.065, 1, ''],
  [322, 'SKLT', 'PT Sekar Laut Tbk', 96.914, 1, ''],
  [323, 'SKRN', 'PT Superkrane Mitra Utama Tbk', 98.877, 1, ''],
  [324, 'SMAR', 'PT Sinar Mas Agro Resources and Technology Tbk', 99.560, 0, ''],
  [325, 'SMCB', 'PT Solusi Bangun Indonesia Tbk', 99.291, 1, ''],
  [326, 'SMDM', 'PT Suryamas Dutamakmur Tbk', 99.484, 1, ''],
  [327, 'SMIL', 'PT Sarana Mitra Luas Tbk', 93.036, 1, ''],
  [328, 'SMKL', 'PT Satyamitra Kemas Lestari Tbk', 93.287, 1, ''],
  [329, 'SMMT', 'PT Golden Eagle Energy Tbk', 96.875, 0, ''],
  [330, 'SOHO', 'PT Soho Global Health Tbk', 99.930, 0, ''],
  [331, 'SONA', 'PT Sona Topas Tourism Industry Tbk', 99.420, 1, ''],
  [332, 'SOSS', 'PT ALSOK Indonesia Services Tbk', 99.846, 1, ''],
  [333, 'SOTS', 'PT Satria Mega Kencana Tbk', 98.355, 0, ''],

  // Page 10 (No. 334 - 383)
  [334, 'SRAJ', 'PT Sejahteraraya Anugrahjaya Tbk', 98.834, 0, ''],
  [335, 'SRTG', 'PT Saratoga Investama Sedaya Tbk', 92.706, 1, ''],
  [336, 'SSMS', 'PT Sawit Sumbermas Sarana Tbk', 95.824, 0, ''],
  [337, 'SSTM', 'PT Sunson Textile Manufacturer Tbk', 97.426, 1, ''],
  [338, 'STAA', 'PT Sumber Tani Agung Resources Tbk', 96.824, 1, ''],
  [339, 'STTP', 'PT Siantar Top Tbk', 94.947, 0, ''],
  [340, 'SUNI', 'PT Sunindo Pratama Tbk', 97.167, 1, ''],
  [341, 'SUPA', 'PT Super Bank Indonesia Tbk', 93.734, 1, ''],
  [342, 'SUPR', 'PT Solusi Tunas Pratama Tbk', 99.979, 1, '***'],
  [343, 'SURE', 'PT Super Energy Tbk', 99.910, 1, ''],
  [344, 'SWID', 'PT Saraswanti Indoland Development Tbk', 97.998, 1, ''],
  [345, 'TALF', 'PT Tunas Alfin Tbk', 99.285, 1, ''],
  [346, 'TAMU', 'PT Pelayaran Tamarin Samudra Tbk', 95.820, 1, ''],
  [347, 'TBIG', 'PT Tower Bersama Infrastructure Tbk', 96.635, 0, ''],
  [348, 'TBMS', 'PT Tembaga Mulia Semanan Tbk', 97.745, 1, ''],
  [349, 'TCID', 'PT Mandom Indonesia Tbk', 96.115, 1, ''],
  [350, 'TCPI', 'PT Transcoal Pacific Tbk', 97.553, 0, ''],
  [351, 'TFCO', 'PT Tifico Fiber Indonesia Tbk', 99.698, 0, ''],
  [352, 'TGKA', 'PT Tigaraksa Satria Tbk', 99.533, 1, ''],
  [353, 'TIFA', 'PT KDB Tifa Finance Tbk', 99.773, 1, ''],
  [354, 'TIRA', 'PT Tira Austenite Tbk', 94.404, 1, ''],
  [355, 'TKIM', 'PT Pabrik Kertas Tjiwi Kimia Tbk', 92.626, 1, ''],
  [356, 'TLDN', 'PT Teladan Prima Agro Tbk', 98.779, 1, ''],
  [357, 'TMAS', 'PT Temas Tbk', 95.300, 0, ''],
  [358, 'TOTO', 'PT Surya Toto Indonesia Tbk', 96.482, 1, ''],
  [359, 'TRGU', 'PT Cerestar Indonesia Tbk', 96.809, 1, ''],
  [360, 'TRIO', 'PT Trikomsel Oke Tbk', 99.853, 1, ''],
  [361, 'TRIS', 'PT Trisula International Tbk', 96.703, 1, ''],
  [362, 'TRJA', 'PT Transkon Jaya Tbk', 93.341, 1, ''],
  [363, 'TRUS', 'PT Trust Finance Indonesia Tbk', 98.180, 1, ''],
  [364, 'TSPC', 'PT Tempo Scan Pacific Tbk', 94.096, 1, ''],
  [365, 'TYRE', 'PT King Tire Indonesia Tbk', 96.824, 1, ''],
  [366, 'UANG', 'PT Pakuan Tbk', 96.192, 1, ''],
  [367, 'UFOE', 'PT Damai Sejahtera Abadi Tbk', 95.480, 1, ''],
  [368, 'URBN', 'PT Urban Jakarta Propertindo Tbk', 97.302, 1, ''],
  [369, 'VAST', 'PT Vastland Indonesia Tbk', 96.411, 1, ''],
  [370, 'VERN', 'PT Verona Indah Pictures Tbk', 96.816, 1, ''],
  [371, 'VICI', 'PT Victoria Care Indonesia Tbk', 93.385, 1, ''],
  [372, 'VINS', 'PT Victoria Insurance Tbk', 97.803, 1, ''],
  [373, 'VOKS', 'PT Voksel Electric Tbk', 99.434, 1, ''],
  [374, 'VRNA', 'PT Mizuho Leasing Indonesia Tbk', 98.785, 1, ''],
  [375, 'WBSA', 'PT BSA Logistics Indonesia Tbk', 94.612, 0, ''],
  [376, 'WICO', 'PT Wicaksana Overseas International Tbk', 99.515, 1, ''],
  [377, 'WIKA', 'PT Wijaya Karya (Persero) Tbk', 93.416, 1, ''],
  [378, 'WOMF', 'PT Wahana Ottomitra Multiartha Tbk', 97.616, 1, ''],
  [379, 'YPAS', 'PT Yanaprima Hastapersada Tbk', 99.598, 1, ''],
  [380, 'YUPI', 'PT Yupi Indo Jelly Gum Tbk', 99.909, 0, ''],
  [381, 'ZBRA', 'PT Dosni Roha Indonesia Tbk', 94.221, 1, ''],
  [382, 'ZONE', 'PT Mega Perintis Tbk', 99.176, 1, ''],
  [383, 'ZYRX', 'PT Zyrexindo Mandiri Buana Tbk', 92.750, 1, '']
];

function mapRawFootnote(flag: '' | '*' | '**' | '***'): KseiHscFootnote {
  if (flag === '*') return 'UNREPORTED_DISTRIBUTION';
  if (flag === '**') return 'REPO_TRANSACTION';
  if (flag === '***') return 'VOLUNTARY_DELISTING';
  return 'NONE';
}

export const IDX_KSEI_HSC_LIST: KseiHscEntry[] = RAW_KSEI_HSC_TUPLES.map(
  ([no, ticker, companyName, top10ConcentrationPct, isNewFlag, fnFlag]) => ({
    no,
    ticker,
    companyName,
    top10ConcentrationPct,
    impliedPublicFloatMaxPct: Number(Math.max(0.001, 100 - top10ConcentrationPct).toFixed(3)),
    isNew: isNewFlag === 1,
    footnote: mapRawFootnote(fnFlag)
  })
);

export const IDX_KSEI_HSC_MAP = new Map<string, KseiHscEntry>(
  IDX_KSEI_HSC_LIST.map((entry) => [entry.ticker, entry])
);

export function getKseiHscEntry(ticker: string): KseiHscEntry | undefined {
  const clean = ticker
    .trim()
    .toUpperCase()
    .replace(/\.JK$/i, '')
    .replace(/^IDX:/i, '');
  return IDX_KSEI_HSC_MAP.get(clean);
}

export function formatKseiFootnoteShortLabel(footnote?: KseiHscFootnote): string {
  switch (footnote) {
    case 'UNREPORTED_DISTRIBUTION':
      return '* Belum Lapor Distribusi';
    case 'REPO_TRANSACTION':
      return '** Transaksi Repo';
    case 'VOLUNTARY_DELISTING':
      return '*** Voluntary Delisting';
    default:
      return '';
  }
}

export function formatKseiFootnoteFullDescription(footnote?: KseiHscFootnote): string {
  switch (footnote) {
    case 'UNREPORTED_DISTRIBUTION':
      return 'Catatan (*): Perusahaan Tercatat belum menyampaikan kepada Bursa informasi penurunan konsentrasi kepemilikan melalui distribusi kepemilikan saham kepada publik melalui Pasar Reguler atau Pasar Tunai.';
    case 'REPO_TRANSACTION':
      return 'Catatan (**): Penurunan kepemilikan terjadi melalui transaksi repo saham, yang berpotensi tidak mengakibatkan adanya perubahan konsentrasi kepemilikan.';
    case 'VOLUNTARY_DELISTING':
      return 'Catatan (***): Perusahaan Tercatat sedang dalam proses penghapusan pencatatan sukarela (voluntary delisting).';
    default:
      return 'Evaluasi konsentrasi kepemilikan kumulatif sampai dengan 10 pemegang saham terbesar (scripless + scrip) >= 92,5% per 30 Oktober 2026 (Peng-HSC-00088/BEI.WAS/11-2026).';
  }
}
