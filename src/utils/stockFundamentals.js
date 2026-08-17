// Comprehensive Fundamental Data and Intelligence for AetherTrade
export const STOCK_FUNDAMENTALS_DATABASE = {
  AAPL: {
    marketCap: '$3.42T',
    marketCapRaw: 3420000000000,
    peRatio: '34.5x',
    forwardPE: '29.2x',
    eps: '$6.58',
    dividendYield: '0.48%',
    avgVolume30D: '48.5M',
    beta: '1.12',
    sharesOutstanding: '15.3B',
    fiftyTwoWeekLow: 164.08,
    fiftyTwoWeekHigh: 237.23,
    sector: 'Technology',
    industry: 'Consumer Electronics',
    ceo: 'Tim Cook',
    headquarters: 'Cupertino, California',
    employees: '161,000',
    description: 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories, and sells a variety of related services including Apple Music, iCloud, and Apple Pay.',
    analystRating: 'Strong Buy',
    analystTarget: { low: 185, avg: 250, high: 300 },
    analystCounts: { buy: 34, hold: 8, sell: 2 },
  },
  MSFT: {
    marketCap: '$3.18T',
    marketCapRaw: 3180000000000,
    peRatio: '36.2x',
    forwardPE: '31.0x',
    eps: '$11.80',
    dividendYield: '0.72%',
    avgVolume30D: '21.4M',
    beta: '1.18',
    sharesOutstanding: '7.43B',
    fiftyTwoWeekLow: 309.45,
    fiftyTwoWeekHigh: 468.35,
    sector: 'Technology',
    industry: 'Software — Infrastructure',
    ceo: 'Satya Nadella',
    headquarters: 'Redmond, Washington',
    employees: '221,000',
    description: 'Microsoft Corporation develops and supports software, services, devices and solutions worldwide, leading enterprise cloud computing with Microsoft Azure and productivity suite Office 365.',
    analystRating: 'Strong Buy',
    analystTarget: { low: 410, avg: 500, high: 550 },
    analystCounts: { buy: 38, hold: 4, sell: 1 },
  },
  NVDA: {
    marketCap: '$3.24T',
    marketCapRaw: 3240000000000,
    peRatio: '68.4x',
    forwardPE: '42.1x',
    eps: '$1.88',
    dividendYield: '0.03%',
    avgVolume30D: '62.8M',
    beta: '1.68',
    sharesOutstanding: '24.5B',
    fiftyTwoWeekLow: 45.01,
    fiftyTwoWeekHigh: 140.76,
    sector: 'Technology',
    industry: 'Semiconductors',
    ceo: 'Jensen Huang',
    headquarters: 'Santa Clara, California',
    employees: '29,600',
    description: 'NVIDIA Corporation pioneers GPU-accelerated computing, powering modern AI datacenter architectures, autonomous machines, and high-performance gaming graphics worldwide.',
    analystRating: 'Strong Buy',
    analystTarget: { low: 120, avg: 155, high: 200 },
    analystCounts: { buy: 42, hold: 3, sell: 1 },
  },
  GOOGL: {
    marketCap: '$2.08T',
    marketCapRaw: 2080000000000,
    peRatio: '24.8x',
    forwardPE: '20.6x',
    eps: '$6.70',
    dividendYield: '0.47%',
    avgVolume30D: '28.1M',
    beta: '1.05',
    sharesOutstanding: '12.4B',
    fiftyTwoWeekLow: 120.21,
    fiftyTwoWeekHigh: 191.75,
    sector: 'Communication Services',
    industry: 'Internet Content & Information',
    ceo: 'Sundar Pichai',
    headquarters: 'Mountain View, California',
    employees: '180,895',
    description: 'Alphabet Inc. provides Google Search, YouTube, Android, Google Cloud enterprise solutions, and innovative AI models including Gemini, serving billions of global daily active users.',
    analystRating: 'Strong Buy',
    analystTarget: { low: 170, avg: 205, high: 240 },
    analystCounts: { buy: 36, hold: 6, sell: 0 },
  },
  AMZN: {
    marketCap: '$1.92T',
    marketCapRaw: 1920000000000,
    peRatio: '43.1x',
    forwardPE: '32.8x',
    eps: '$4.18',
    dividendYield: '0.00%',
    avgVolume30D: '39.6M',
    beta: '1.15',
    sharesOutstanding: '10.4B',
    fiftyTwoWeekLow: 118.35,
    fiftyTwoWeekHigh: 201.20,
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail',
    ceo: 'Andy Jassy',
    headquarters: 'Seattle, Washington',
    employees: '1,525,000',
    description: 'Amazon.com, Inc. focuses on retail, cloud computing with AWS (Amazon Web Services), digital streaming, online advertising, and artificial intelligence consumer hardware.',
    analystRating: 'Strong Buy',
    analystTarget: { low: 200, avg: 225, high: 250 },
    analystCounts: { buy: 44, hold: 2, sell: 0 },
  },
  META: {
    marketCap: '$1.35T',
    marketCapRaw: 1350000000000,
    peRatio: '27.4x',
    forwardPE: '23.1x',
    eps: '$19.50',
    dividendYield: '0.38%',
    avgVolume30D: '14.2M',
    beta: '1.22',
    sharesOutstanding: '2.53B',
    fiftyTwoWeekLow: 279.40,
    fiftyTwoWeekHigh: 544.23,
    sector: 'Communication Services',
    industry: 'Internet Content & Information',
    ceo: 'Mark Zuckerberg',
    headquarters: 'Menlo Park, California',
    employees: '70,799',
    description: 'Meta Platforms, Inc. builds technologies that help people connect, find communities, and grow businesses across Facebook, Instagram, WhatsApp, Messenger, and Meta Quest VR.',
    analystRating: 'Strong Buy',
    analystTarget: { low: 480, avg: 575, high: 640 },
    analystCounts: { buy: 40, hold: 5, sell: 1 },
  },
  TSLA: {
    marketCap: '$720B',
    marketCapRaw: 720000000000,
    peRatio: '62.1x',
    forwardPE: '54.3x',
    eps: '$3.55',
    dividendYield: '0.00%',
    avgVolume30D: '88.5M',
    beta: '2.42',
    sharesOutstanding: '3.19B',
    fiftyTwoWeekLow: 138.80,
    fiftyTwoWeekHigh: 271.00,
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    ceo: 'Elon Musk',
    headquarters: 'Austin, Texas',
    employees: '140,473',
    description: 'Tesla, Inc. designs, develops, manufactures, sells, and leases fully electric vehicles, energy generation and storage systems, and develops Full Self-Driving (FSD) artificial intelligence.',
    analystRating: 'Hold',
    analystTarget: { low: 115, avg: 215, high: 310 },
    analystCounts: { buy: 18, hold: 16, sell: 10 },
  },
  AMD: {
    marketCap: '$242B',
    marketCapRaw: 2420000000000,
    peRatio: '115.0x',
    forwardPE: '38.5x',
    eps: '$1.30',
    dividendYield: '0.00%',
    avgVolume30D: '54.2M',
    beta: '1.69',
    sharesOutstanding: '1.62B',
    fiftyTwoWeekLow: 94.04,
    fiftyTwoWeekHigh: 227.30,
    sector: 'Technology',
    industry: 'Semiconductors',
    ceo: 'Dr. Lisa Su',
    headquarters: 'Santa Clara, California',
    employees: '26,000',
    description: 'Advanced Micro Devices, Inc. operates as a semiconductor company offering x86 microprocessors, accelerated processing units (APUs), GPUs, and Instinct AI data center accelerators.',
    analystRating: 'Buy',
    analystTarget: { low: 140, avg: 190, high: 250 },
    analystCounts: { buy: 30, hold: 7, sell: 1 },
  },
  NFLX: {
    marketCap: '$290B',
    marketCapRaw: 290000000000,
    peRatio: '42.8x',
    forwardPE: '33.4x',
    eps: '$15.80',
    dividendYield: '0.00%',
    avgVolume30D: '3.4M',
    beta: '1.28',
    sharesOutstanding: '429M',
    fiftyTwoWeekLow: 365.10,
    fiftyTwoWeekHigh: 711.33,
    sector: 'Communication Services',
    industry: 'Entertainment',
    ceo: 'Ted Sarandos & Greg Peters',
    headquarters: 'Los Gatos, California',
    employees: '13,000',
    description: 'Netflix, Inc. provides entertainment services, offering TV series, documentaries, feature films, and games across a wide variety of genres and languages to 275+ million paid members.',
    analystRating: 'Buy',
    analystTarget: { low: 550, avg: 720, high: 800 },
    analystCounts: { buy: 28, hold: 10, sell: 2 },
  },
  SPY: {
    marketCap: '$580B',
    marketCapRaw: 580000000000,
    peRatio: '27.1x',
    forwardPE: '22.4x',
    eps: '$20.80',
    dividendYield: '1.24%',
    avgVolume30D: '45.8M',
    beta: '1.00',
    sharesOutstanding: '985M',
    fiftyTwoWeekLow: 410.05,
    fiftyTwoWeekHigh: 565.16,
    sector: 'Financial / ETF',
    industry: 'Index Fund',
    ceo: 'State Street Global Advisors',
    headquarters: 'Boston, Massachusetts',
    employees: 'N/A',
    description: 'SPDR S&P 500 ETF Trust seeks to provide investment results that correspond generally to the price and yield performance of the S&P 500 Index, representing 500 leading US corporations.',
    analystRating: 'Strong Buy',
    analystTarget: { low: 520, avg: 580, high: 620 },
    analystCounts: { buy: 40, hold: 5, sell: 0 },
  }
};

export function getStockFundamentals(ticker, livePrice = 150, historicalPoints = []) {
  const upperTicker = (ticker || 'AAPL').toUpperCase();
  const dbData = STOCK_FUNDAMENTALS_DATABASE[upperTicker];

  let low52 = Infinity;
  let high52 = -Infinity;

  if (historicalPoints && historicalPoints.length > 0) {
    historicalPoints.forEach(p => {
      const l = p.low !== undefined ? p.low : p.close;
      const h = p.high !== undefined ? p.high : p.close;
      if (l < low52) low52 = l;
      if (h > high52) high52 = h;
    });
  }

  if (low52 === Infinity || high52 === -Infinity || low52 >= high52) {
    low52 = dbData ? dbData.fiftyTwoWeekLow : (livePrice * 0.72);
    high52 = dbData ? dbData.fiftyTwoWeekHigh : (livePrice * 1.35);
  }

  const effectiveLow = parseFloat(low52.toFixed(2));
  const effectiveHigh = parseFloat(high52.toFixed(2));
  const range52Pct = effectiveHigh > effectiveLow 
    ? Math.max(0, Math.min(100, ((livePrice - effectiveLow) / (effectiveHigh - effectiveLow)) * 100))
    : 50;

  if (dbData) {
    return {
      ...dbData,
      fiftyTwoWeekLow: effectiveLow,
      fiftyTwoWeekHigh: effectiveHigh,
      range52Pct,
      isCurated: true,
    };
  }

  // Dynamic estimate fallback for unlisted custom search tickers
  const estimatedMarketCap = (livePrice * 450000000);
  const formattedCap = estimatedMarketCap > 1000000000000 
    ? `$${(estimatedMarketCap / 1000000000000).toFixed(2)}T`
    : estimatedMarketCap > 1000000000 
      ? `$${(estimatedMarketCap / 1000000000).toFixed(1)}B`
      : `$${(estimatedMarketCap / 1000000).toFixed(0)}M`;

  return {
    marketCap: formattedCap,
    marketCapRaw: estimatedMarketCap,
    peRatio: `${(20 + (livePrice % 15)).toFixed(1)}x`,
    forwardPE: `${(18 + (livePrice % 12)).toFixed(1)}x`,
    eps: `$${(livePrice / 25).toFixed(2)}`,
    dividendYield: livePrice > 200 ? '0.85%' : '0.00%',
    avgVolume30D: `${(15 + (livePrice % 30)).toFixed(1)}M`,
    beta: `${(0.95 + (livePrice % 0.8)).toFixed(2)}`,
    sharesOutstanding: '450M',
    fiftyTwoWeekLow: effectiveLow,
    fiftyTwoWeekHigh: effectiveHigh,
    range52Pct,
    sector: 'Equity Market',
    industry: 'Public Company',
    ceo: 'Executive Management',
    headquarters: 'United States',
    employees: 'Corporate',
    description: `${upperTicker} is a publicly traded company on major US equities markets. Real-time valuation and performance metrics are tracked live in the AetherTrade terminal.`,
    analystRating: 'Moderate Buy',
    analystTarget: { low: Math.round(livePrice * 0.85), avg: Math.round(livePrice * 1.15), high: Math.round(livePrice * 1.35) },
    analystCounts: { buy: 18, hold: 6, sell: 1 },
    isCurated: false,
  };
}
