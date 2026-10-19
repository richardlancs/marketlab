/**
 * Real starting points for the mock market, so its numbers look like the real
 * market's even though its day-to-day prices are simulated.
 *
 * For each stock: its price around Oct 16, 2026 (the mock market's anchor
 * day), its market cap in billions of dollars, and its approximate dividend
 * yield in percent (0 = pays none). Prices and market caps were read from
 * stockanalysis.com's public lists on Oct 19, 2026; yields are rough, from
 * each company's typical dividend. The index levels are approximate closes
 * from Oct 9, 2026.
 *
 * Only these single starting numbers are real. Every price before and after
 * the anchor day is generated, and the site always says so.
 */

/** [price, market cap in $ billions, dividend yield in %] */
export const ANCHORS: Record<string, readonly [price: number, capBillions: number, yieldPercent: number]> = {
  // Core stocks
  AAPL: [343.65, 5020, 0.3],
  MSFT: [534.08, 3970, 0.7],
  NVDA: [217.4, 5250, 0.02],
  GOOGL: [344.4, 4210, 0.25],
  AMZN: [261.99, 2830, 0],
  META: [702.75, 1790, 0.3],
  TSLA: [367.89, 1450, 0],
  JPM: [334.65, 888.7, 1.8],
  V: [403.43, 740.54, 0.65],
  NFLX: [69.55, 289.58, 0],
  // Technology and semiconductors
  ORCL: [130.04, 394.22, 1.5],
  CRM: [242.01, 199.17, 0.7],
  ADBE: [246.38, 95.89, 0],
  IBM: [236.98, 223.27, 2.8],
  CSCO: [107.15, 422.43, 1.5],
  ACN: [235.36, 139.04, 2.5],
  INTU: [325.88, 87.09, 1.5],
  NOW: [144.49, 149.38, 0],
  PLTR: [194.36, 467.06, 0],
  SHOP: [171.13, 220.18, 0],
  UBER: [70.2, 143.39, 0],
  AVGO: [335.14, 1600, 0.8],
  AMD: [539.14, 880.13, 0],
  INTC: [92.39, 485.47, 0],
  QCOM: [173.23, 184.98, 2.1],
  TXN: [275.97, 252.03, 2.1],
  MU: [905.34, 1020, 0.05],
  AMAT: [416.75, 330.73, 0.45],
  TSM: [421.54, 1970, 0.8],
  // Communication services
  DIS: [109.9, 189.76, 1.4],
  CMCSA: [22.03, 78.16, 5],
  T: [23.36, 160.07, 4.8],
  VZ: [44.44, 184.64, 6.2],
  TMUS: [158.08, 169.57, 2.6],
  SPOT: [516.49, 106.18, 0],
  // Consumer discretionary
  HD: [310.31, 309.59, 3],
  LOW: [196.4, 110.19, 2.4],
  MCD: [243.22, 172.11, 3.1],
  SBUX: [98.16, 111.88, 2.5],
  NKE: [37.11, 55.12, 4.4],
  BKNG: [161.9, 121.65, 0.9],
  TJX: [147.59, 162.35, 1.15],
  GM: [82.59, 72.47, 0.7],
  F: [12.18, 48.57, 4.9],
  ABNB: [175.13, 103.25, 0],
  // Consumer staples
  WMT: [119.24, 946.02, 0.8],
  COST: [996.54, 441.6, 0.5],
  PG: [158.22, 367.49, 2.7],
  KO: [93.86, 403.84, 2.2],
  PEP: [133.26, 181.6, 4.3],
  PM: [202.84, 316.15, 2.9],
  MDLZ: [63.6, 81.17, 3.1],
  CL: [93.53, 74.56, 2.2],
  TGT: [153.78, 69.86, 3],
  // Financials
  "BRK-B": [532.44, 1140, 0],
  MA: [615.48, 539.17, 0.5],
  BAC: [50.41, 348.97, 2.2],
  WFC: [82.26, 246.9, 2.2],
  GS: [874.9, 264.89, 1.8],
  MS: [179.06, 280.22, 2.2],
  C: [122.24, 202.33, 2],
  AXP: [315.69, 213.19, 1],
  BLK: [1125.3, 182.53, 1.85],
  SCHW: [89.74, 155.19, 1.2],
  PYPL: [56.27, 48.14, 0],
  // Health care
  UNH: [404.58, 363.15, 2.2],
  JNJ: [254.35, 612.96, 2],
  LLY: [1251.73, 1120, 0.5],
  ABBV: [284.53, 502.8, 2.3],
  MRK: [144.5, 356.51, 2.2],
  PFE: [29.46, 167.91, 5.8],
  TMO: [679.77, 251.34, 0.25],
  ABT: [104.29, 180.46, 2.3],
  AMGN: [428.3, 231.55, 2.2],
  ISRG: [433.26, 153.06, 0],
  CVS: [91.59, 117.14, 2.9],
  // Industrials
  CAT: [726.33, 333.88, 0.83],
  BA: [191.28, 151.18, 0],
  GE: [312.84, 324.59, 0.46],
  HON: [210.64, 66.76, 2.2],
  UPS: [97.24, 82.73, 6.7],
  RTX: [193.1, 260.25, 1.4],
  LMT: [553, 127.63, 2.4],
  DE: [630.71, 170.06, 1],
  UNP: [287.87, 171.02, 1.9],
  DAL: [75, 49.08, 1],
  // Energy, materials, utilities and real estate
  XOM: [178.89, 735.58, 2.2],
  CVX: [225, 441.36, 3],
  COP: [145.44, 174.72, 2.1],
  LIN: [504.04, 232.35, 1.2],
  NEM: [118.63, 123.6, 0.84],
  NEE: [78.42, 163.58, 2.9],
  DUK: [119.77, 93.38, 3.5],
  PLD: [124.18, 120.4, 3.3],
  AMT: [181.87, 84.74, 3.7],
  O: [55.56, 52.55, 5.8],
};

/** Approximate index levels (Oct 9, 2026 closes). */
export const INDEX_ANCHORS: Record<string, number> = {
  SPX: 7811,
  IXIC: 27366,
  DJI: 51655,
};
