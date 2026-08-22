import { useRef, useEffect, useState, useMemo } from 'react';
import { createChart, CrosshairMode, AreaSeries, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import StockInsights from './StockInsights';
import {
  detectTickerCurrency,
  getCurrencySymbol,
  formatMoney
} from '../utils/currencyUtils';

const RANGE_INTERVALS = {
  '1D': {
    allowed: ['1m', '5m', '15m', '1h'],
    default: '15m'
  },
  '1W': {
    allowed: ['5m', '15m', '1h', '1d'],
    default: '1h'
  },
  '1M': {
    allowed: ['15m', '1h', '1d', '1w'],
    default: '1d'
  },
  '1Y': {
    allowed: ['1d', '1w'],
    default: '1w'
  },
  '5Y': {
    allowed: ['1d', '1w'],
    default: '1w'
  }
};

// Moving Average & Technical Calculations
function calculateEMA(data, period = 20) {
  if (!data || data.length < period) return [];
  const results = [];
  let ema = data.slice(0, period).reduce((sum, d) => sum + d.close, 0) / period;
  results.push({ time: data[period - 1].time, value: parseFloat(ema.toFixed(2)) });
  const k = 2 / (period + 1);
  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    results.push({ time: data[i].time, value: parseFloat(ema.toFixed(2)) });
  }
  return results;
}

function calculateSMA(data, period = 50) {
  if (!data || data.length < period) return [];
  const results = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  results.push({ time: data[period - 1].time, value: parseFloat((sum / period).toFixed(2)) });
  for (let i = period; i < data.length; i++) {
    sum += data[i].close - data[i - period].close;
    results.push({ time: data[i].time, value: parseFloat((sum / period).toFixed(2)) });
  }
  return results;
}

function calculateVolumeData(data, rawValues) {
  if (!data || data.length === 0) return [];
  return data.map((item, idx) => {
    const raw = rawValues[idx];
    let vol = raw && raw.volume ? parseFloat(raw.volume) : null;
    if (!vol || isNaN(vol)) {
      const spread = Math.abs(item.high - item.low) || (item.close * 0.002);
      vol = Math.round(spread * 300000 + 100000 + (idx % 5) * 20000);
    }
    const isUp = item.close >= item.open;
    return {
      time: item.time,
      value: vol,
      color: isUp ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)',
    };
  });
}

export default function ChartContainer({
  activeTicker,
  stocks,
  range,
  setRange,
  interval,
  setInterval,
  chartType,
  setChartType,
  showLevels,
  setShowLevels,
  zoomLevel,
  setZoomLevel,
  linesMap,
  setLinesMap,
  onRefresh,
  isLoading
}) {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const seriesRef = useRef(null);
  const panelRef = useRef(null);
  const isScaleUpdatingRef = useRef(false);

  const [hoverPrice, setHoverPrice] = useState(null);
  const [hoverData, setHoverData] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [indicators, setIndicators] = useState({
    volume: true,
    ema20: false,
    sma50: false,
  });

  const toggleIndicator = (key) => {
    setIndicators(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const handleFsChange = () => {
      const fsActive = !!document.fullscreenElement;
      setIsFullscreen(fsActive);
      setTimeout(() => {
        if (chartInstanceRef.current && chartContainerRef.current) {
          const { clientWidth, clientHeight } = chartContainerRef.current;
          chartInstanceRef.current.applyOptions({ width: clientWidth, height: clientHeight });
        }
      }, 100);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!panelRef.current) return;
    if (!document.fullscreenElement) {
      if (panelRef.current.requestFullscreen) {
        panelRef.current.requestFullscreen().catch(() => {
          setIsFullscreen(prev => !prev);
          setTimeout(() => {
            if (chartInstanceRef.current && chartContainerRef.current) {
              const { clientWidth, clientHeight } = chartContainerRef.current;
              chartInstanceRef.current.applyOptions({ width: clientWidth, height: clientHeight });
            }
          }, 100);
        });
      } else {
        setIsFullscreen(prev => !prev);
        setTimeout(() => {
          if (chartInstanceRef.current && chartContainerRef.current) {
            const { clientWidth, clientHeight } = chartContainerRef.current;
            chartInstanceRef.current.applyOptions({ width: clientWidth, height: clientHeight });
          }
        }, 100);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else {
        setIsFullscreen(false);
        setTimeout(() => {
          if (chartInstanceRef.current && chartContainerRef.current) {
            const { clientWidth, clientHeight } = chartContainerRef.current;
            chartInstanceRef.current.applyOptions({ width: clientWidth, height: clientHeight });
          }
        }, 100);
      }
    }
  };

  const activeStock = {
    ticker: activeTicker,
    name: `${activeTicker} Stock`,
    price: 150.00,
    change: 0.0,
    timeframeChange: 0.0,
    liveCloses: [],
    liveLabels: [],
    liveRawValues: [],
    ...stocks[activeTicker]
  };

  const formattedData = useMemo(() => {
    const rawValues = activeStock.liveRawValues || [];
    let dataPoints;

    if (rawValues.length === 0 && activeStock.liveCloses.length > 0) {
      const closes = activeStock.liveCloses;
      const labels = activeStock.liveLabels;
      dataPoints = closes.map((c, idx) => {
        const prev = idx > 0 ? closes[idx - 1] : c * 0.985;
        const o = parseFloat(prev.toFixed(2));
        const cl = parseFloat(c.toFixed(2));
        const spread = Math.abs(cl - o) || c * 0.005;
        const pseudo = Math.abs((Math.sin(idx * 12.9898 + 78.233) * 43758.5453) % 1);
        const h = parseFloat((Math.max(o, cl) + pseudo * spread * 0.5).toFixed(2));
        const l = parseFloat((Math.min(o, cl) - pseudo * spread * 0.5).toFixed(2));
        return { open: o, close: cl, high: h, low: l, datetime: labels[idx] };
      });
    } else {
      dataPoints = rawValues;
    }

    if (range === '1D' && dataPoints.length > 0) {
      const lastItem = dataPoints[dataPoints.length - 1];
      if (lastItem && lastItem.datetime) {
        const latestDateStr = lastItem.datetime.split(' ')[0];
        dataPoints = dataPoints.filter(item => item.datetime && item.datetime.startsWith(latestDateStr));
      }
    }

    const seenTimes = new Set();
    const result = [];

    dataPoints.forEach(item => {
      if (!item.datetime) return;
      let t;
      const parts = item.datetime.split(' ');
      if (parts.length === 1) {
        const dateObj = new Date(parts[0] + 'T00:00:00Z');
        t = Math.floor(dateObj.getTime() / 1000);
      } else {
        const [datePart, timePart] = parts;
        const dateObj = new Date(`${datePart}T${timePart}`);
        t = Math.floor(dateObj.getTime() / 1000);
      }

      if (!isNaN(t) && !seenTimes.has(t)) {
        seenTimes.add(t);
        result.push({
          time: t,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          value: parseFloat(item.close)
        });
      }
    });

    const sorted = result.sort((a, b) => a.time - b.time);

    if (range === '1D' && chartType === 'line' && sorted.length > 0) {
      const currentPrice = parseFloat(activeStock.price) || sorted[sorted.length - 1].close;
      const changePct = parseFloat(activeStock.change) || 0;
      const prevClose = changePct !== 0 ? parseFloat((currentPrice / (1 + changePct / 100)).toFixed(2)) : sorted[0].open;
      const startTime = sorted[0].time - 60;

      if (startTime > 0 && !seenTimes.has(startTime)) {
        return [
          { time: startTime, open: prevClose, high: prevClose, low: prevClose, close: prevClose, value: prevClose },
          ...sorted
        ];
      }
    }

    return sorted;
  }, [activeStock.liveRawValues, activeStock.liveCloses, activeStock.liveLabels, activeStock.price, activeStock.change, range, chartType]);

  const sessionStats = useMemo(() => {
    if (!formattedData || formattedData.length === 0) {
      return { low: 0, high: 0, open: 0 };
    }
    let low = Infinity;
    let high = -Infinity;
    formattedData.forEach(d => {
      if (d.low < low) low = d.low;
      if (d.high > high) high = d.high;
    });
    return {
      low: low === Infinity ? 0 : low,
      high: high === -Infinity ? 0 : high,
      open: formattedData[0]?.open || 0
    };
  }, [formattedData]);

  const computedChange = useMemo(() => {
    if (formattedData.length >= 2) {
      const firstPrice = formattedData[0].close || formattedData[0].open;
      const lastPrice = formattedData[formattedData.length - 1].close;
      if (firstPrice > 0) {
        return ((lastPrice - firstPrice) / firstPrice) * 100;
      }
    }
    return activeStock.change || 0;
  }, [formattedData, activeStock.change]);

  const activeHoverValue = useMemo(() => {
    if (hoverData) {
      if (hoverData.close !== undefined) return hoverData.close;
      if (hoverData.value !== undefined) return hoverData.value;
    }
    return null;
  }, [hoverData]);

  const displayChange = range === '1D' ? computedChange : (activeStock.timeframeChange || computedChange || activeStock.change || 0);
  const isUp = displayChange >= 0;

  const handleRangeChange = (targetRange) => {
    setRange(targetRange);
    setZoomLevel(100);

    const rangeInfo = RANGE_INTERVALS[targetRange];
    if (!rangeInfo.allowed.includes(interval)) {
      setInterval(rangeInfo.default);
    }
  };

  const handleIntervalChange = (targetInterval) => {
    setInterval(targetInterval);
    setZoomLevel(100);
  };

  // Sync mutable refs on each render to prevent stale closures in event listeners
  const formattedDataRef = useRef(formattedData);
  const linesMapRef = useRef(linesMap);
  const showLevelsRef = useRef(showLevels);
  const activeTickerRef = useRef(activeTicker);
  const activeStockRef = useRef(activeStock);
  const setLinesMapRef = useRef(setLinesMap);
  const priceLinesRef = useRef([]);
  const emaSeriesRef = useRef(null);
  const smaSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  useEffect(() => {
    formattedDataRef.current = formattedData;
    linesMapRef.current = linesMap;
    showLevelsRef.current = showLevels;
    activeTickerRef.current = activeTicker;
    activeStockRef.current = activeStock;
    setLinesMapRef.current = setLinesMap;
  });

  // 1. Chart Creation Effect (runs on ticker, series type, or indicator structure change)
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const isUp = (activeStock.change ?? 0) >= 0;
    const tickerCurr = detectTickerCurrency(activeTicker);
    const currSym = getCurrencySymbol(tickerCurr);

    const chart = createChart(container, {
      localization: {
        priceFormatter: (price) => `${currSym}${price.toFixed(2)}`
      },
      layout: {
        background: { color: 'rgba(5, 8, 16, 0.95)' },
        textColor: '#94A3B8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)', style: 1 },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)', style: 1 },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.1,
          bottom: indicators.volume ? 0.25 : 0.15,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 12,
        minBarSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(6, 182, 212, 0.4)',
          width: 1,
          style: 3,
        },
        horzLine: {
          color: 'rgba(6, 182, 212, 0.4)',
          width: 1,
          style: 3,
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartInstanceRef.current = chart;

    // Technical Indicators Series
    if (indicators.volume) {
      try {
        const volSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume_scale',
        });
        chart.priceScale('volume_scale').applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });
        volumeSeriesRef.current = volSeries;
      } catch (e) {
        console.warn('Volume series init skipped:', e);
      }
    } else {
      volumeSeriesRef.current = null;
    }

    if (indicators.ema20) {
      try {
        const emaSeries = chart.addSeries(LineSeries, {
          color: '#06B6D4',
          lineWidth: 1.5,
          priceLineVisible: false,
          title: 'EMA 20',
        });
        emaSeriesRef.current = emaSeries;
      } catch (e) {
        console.warn('EMA series init skipped:', e);
      }
    } else {
      emaSeriesRef.current = null;
    }

    if (indicators.sma50) {
      try {
        const smaSeries = chart.addSeries(LineSeries, {
          color: '#F59E0B',
          lineWidth: 1.5,
          priceLineVisible: false,
          title: 'SMA 50',
        });
        smaSeriesRef.current = smaSeries;
      } catch (e) {
        console.warn('SMA series init skipped:', e);
      }
    } else {
      smaSeriesRef.current = null;
    }

    const seriesColor = isUp ? '#10B981' : '#F43F5E';
    let series;

    if (chartType === 'candle') {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#10B981',
        downColor: '#F43F5E',
        borderDownColor: '#F43F5E',
        borderUpColor: '#10B981',
        wickDownColor: '#F43F5E',
        wickUpColor: '#10B981',
        priceLineVisible: true,
        priceLineColor: 'rgba(255, 255, 255, 0.2)',
        priceLineStyle: 2,
        priceFormat: {
          type: 'custom',
          formatter: (p) => `${currSym}${p.toFixed(2)}`
        }
      });
    } else {
      series = chart.addSeries(AreaSeries, {
        lineColor: seriesColor,
        topColor: isUp ? 'rgba(16, 185, 129, 0.22)' : 'rgba(244, 63, 94, 0.22)',
        bottomColor: 'rgba(2, 4, 10, 0)',
        lineWidth: 2.5,
        priceLineVisible: true,
        priceLineColor: 'rgba(255, 255, 255, 0.2)',
        priceLineStyle: 2,
        priceFormat: {
          type: 'custom',
          formatter: (p) => `${currSym}${p.toFixed(2)}`
        }
      });
    }

    seriesRef.current = series;

    // Populate initial data and fit content across the container
    if (formattedDataRef.current && formattedDataRef.current.length > 0) {
      try {
        series.setData(formattedDataRef.current);
        if (volumeSeriesRef.current) {
          const volData = calculateVolumeData(formattedDataRef.current, activeStockRef.current.liveRawValues || []);
          volumeSeriesRef.current.setData(volData);
        }
        if (emaSeriesRef.current) {
          const emaData = calculateEMA(formattedDataRef.current, 20);
          emaSeriesRef.current.setData(emaData);
        }
        if (smaSeriesRef.current) {
          const smaData = calculateSMA(formattedDataRef.current, 50);
          smaSeriesRef.current.setData(smaData);
        }
        chart.timeScale().fitContent();
      } catch (err) {
        console.warn('Initial chart data populate error:', err);
      }
    }

    // Chart Click: Add Support / Resistance using Ref values
    const handleChartClick = (param) => {
      if (!showLevelsRef.current || !param.point || !seriesRef.current) return;
      const clickedPrice = seriesRef.current.coordinateToPrice(param.point.y);
      if (clickedPrice === null || clickedPrice === undefined) return;

      const roundedPrice = parseFloat(clickedPrice.toFixed(2));
      const currentTicker = activeTickerRef.current;
      const existingLines = linesMapRef.current[currentTicker] || [];
      const isDuplicate = existingLines.some(price => Math.abs(price - roundedPrice) < (activeStockRef.current.price * 0.003));

      if (!isDuplicate && setLinesMapRef.current) {
        const newLines = [...existingLines, roundedPrice];
        setLinesMapRef.current((prev) => ({
          ...prev,
          [currentTicker]: newLines
        }));
      }
    };
    chart.subscribeClick(handleChartClick);

    // Crosshair Move & Hover Tracking
    const handleCrosshairMove = (param) => {
      if (!param || !param.point || !seriesRef.current) {
        setHoverPrice(null);
        setHoverData(null);
        return;
      }

      // If cursor is outside the visible chart boundaries, clear hover state
      if (param.point.x < 0 || param.point.y < 0 || param.point.x > container.clientWidth || param.point.y > container.clientHeight) {
        setHoverPrice(null);
        setHoverData(null);
        return;
      }

      const price = seriesRef.current.coordinateToPrice(param.point.y);
      setHoverPrice(price !== null ? parseFloat(price.toFixed(2)) : null);

      if (param.time && seriesRef.current) {
        const pointData = param.seriesData.get(seriesRef.current);
        setHoverData(pointData || null);
      } else {
        setHoverData(null);
      }
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    // Explicit Mouse Leave / Pointer Leave on Chart Container
    const handleMouseLeave = () => {
      setHoverPrice(null);
      setHoverData(null);
    };
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('pointerleave', handleMouseLeave);

    // Visible Logical Range Change for Zoom Tracking
    const handleVisibleLogicalRangeChange = (logicalRange) => {
      if (isScaleUpdatingRef.current || !logicalRange) return;
      const curLen = formattedDataRef.current.length;
      if (curLen === 0) return;
      const visibleCount = logicalRange.to - logicalRange.from;
      const percent = Math.round((visibleCount / curLen) * 100);
      const boundedPercent = Math.max(20, Math.min(100, percent));

      isScaleUpdatingRef.current = true;
      setZoomLevel(boundedPercent);
      setTimeout(() => {
        isScaleUpdatingRef.current = false;
      }, 50);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);

    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        const w = chartContainerRef.current.clientWidth;
        const h = chartContainerRef.current.clientHeight;
        chartInstanceRef.current.applyOptions({
          width: w,
          height: h,
          rightPriceScale: {
            visible: w >= 600,
          },
        });
      }
    };
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0 && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: Math.floor(width),
          height: Math.floor(height),
          rightPriceScale: {
            visible: width >= 600,
          },
        });
        if (chartInstanceRef.current && !isScaleUpdatingRef.current) {
          chartInstanceRef.current.timeScale().fitContent();
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('pointerleave', handleMouseLeave);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeClick(handleChartClick);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartInstanceRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      emaSeriesRef.current = null;
      smaSeriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, [
    activeTicker,
    activeStock.change,
    chartType,
    range,
    interval,
    indicators.volume,
    indicators.ema20,
    indicators.sma50,
    setZoomLevel
  ]);

  // 2. Data Update Effect (Updates series data without recreating the chart canvas)
  useEffect(() => {
    if (!seriesRef.current || formattedData.length === 0) return;
    try {
      seriesRef.current.setData(formattedData);
      if (volumeSeriesRef.current) {
        const volData = calculateVolumeData(formattedData, activeStock.liveRawValues || []);
        volumeSeriesRef.current.setData(volData);
      }
      if (emaSeriesRef.current) {
        const emaData = calculateEMA(formattedData, 20);
        emaSeriesRef.current.setData(emaData);
      }
      if (smaSeriesRef.current) {
        const smaData = calculateSMA(formattedData, 50);
        smaSeriesRef.current.setData(smaData);
      }
      if (chartInstanceRef.current && zoomLevel === 100) {
        chartInstanceRef.current.timeScale().fitContent();
      }
    } catch (err) {
      console.warn('Series setData update error:', err);
    }
  }, [formattedData, activeStock.liveRawValues, zoomLevel]);

  // 3. S/R Lines Sync Effect (Updates Lightweight Charts price lines independently)
  useEffect(() => {
    if (!seriesRef.current) return;

    // Clear existing price lines
    priceLinesRef.current.forEach((line) => {
      try {
        seriesRef.current.removePriceLine(line);
      } catch {
        // Safe ignore
      }
    });
    priceLinesRef.current = [];

    if (!showLevels) return;

    const lines = linesMap[activeTicker] || [];
    const tickerCurr = detectTickerCurrency(activeTicker);
    lines.forEach((linePrice) => {
      const isResistance = linePrice > activeStock.price;
      const lineColor = isResistance ? '#F43F5E' : '#10B981';
      const labelTitle = isResistance ? `RES ${formatMoney(linePrice, tickerCurr)}` : `SUP ${formatMoney(linePrice, tickerCurr)}`;

      try {
        const pl = seriesRef.current.createPriceLine({
          price: linePrice,
          color: lineColor,
          lineWidth: 2,
          lineStyle: 1,
          axisLabelVisible: true,
          title: labelTitle,
        });
        priceLinesRef.current.push(pl);
      } catch (err) {
        console.warn('createPriceLine skipped:', err);
      }
    });
  }, [linesMap, activeTicker, showLevels, activeStock.price]);

  // 4. Zoom / Logical Range Effect
  useEffect(() => {
    if (!chartInstanceRef.current || formattedData.length === 0 || isScaleUpdatingRef.current) return;
    if (zoomLevel === 100) {
      try {
        chartInstanceRef.current.timeScale().fitContent();
      } catch {
        // Safe ignore
      }
      return;
    }
    const totalLength = formattedData.length;
    const visibleCount = Math.max(5, Math.round((totalLength * zoomLevel) / 100));
    try {
      chartInstanceRef.current.timeScale().setVisibleLogicalRange({
        from: totalLength - visibleCount,
        to: totalLength - 1,
      });
    } catch {
      // Safe ignore
    }
  }, [zoomLevel, formattedData.length]);

  const rangePercent = sessionStats.high > sessionStats.low
    ? Math.max(0, Math.min(100, ((activeStock.price - sessionStats.low) / (sessionStats.high - sessionStats.low)) * 100))
    : 50;

  const tickerCurrency = detectTickerCurrency(activeTicker);

  return (
    <section
      ref={panelRef}
      className={`panel panel-center ${isFullscreen ? 'fullscreen-mode' : ''}`}
      aria-label="Interactive Charting Terminal"
      style={isFullscreen ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        background: '#060912',
        padding: '16px',
        borderRadius: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column'
      } : {}}
    >
      <div className="chart-header">
        <div className="stock-info-block">
          <button
            onClick={onRefresh}
            className="btn-refresh"
            id="btnRefreshStock"
            title="Refresh stock price"
            aria-label="Refresh stock price"
            disabled={isLoading}
          >
            <i className={`fa-solid fa-arrows-rotate ${isLoading ? 'fa-spin' : ''}`}></i>
          </button>
          <div className="stock-badge" id="activeTicker">
            {activeStock.ticker}
          </div>
          <div className="stock-details">
            <h1 className="stock-name" id="activeName">
              {activeStock.name}
            </h1>
            <div className="stock-metrics">
              <span className="stock-price tabular-nums" id="activePrice" style={activeHoverValue !== null ? { color: 'var(--cyan)' } : {}}>
                {formatMoney(activeHoverValue !== null ? activeHoverValue : activeStock.price, tickerCurrency)}
              </span>
              <span className={`stock-trend tabular-nums ${isUp ? 'positive' : 'negative'}`} id="activeChange" title={range === '1D' ? 'Day change relative to Yesterday Close' : `${range} change`}>
                {isUp ? '+' : ''}
                {displayChange.toFixed(2)}%
              </span>
            </div>
          </div>

          {sessionStats.high > 0 && sessionStats.low > 0 && (
            <div className="session-range-meter" title={`Session Range: Low ${formatMoney(sessionStats.low, tickerCurrency)} — High ${formatMoney(sessionStats.high, tickerCurrency)} (Current position: ${rangePercent.toFixed(0)}%)`}>
              <div className="session-range-labels">
                <span className="range-low tabular-nums">
                  <span className="range-tag">LOW</span> {formatMoney(sessionStats.low, tickerCurrency)}
                </span>
                <span className="range-mid-badge tabular-nums">{rangePercent.toFixed(0)}%</span>
                <span className="range-high tabular-nums">
                  <span className="range-tag">HIGH</span> {formatMoney(sessionStats.high, tickerCurrency)}
                </span>
              </div>
              <div className="session-range-track">
                <div className="session-range-fill" style={{ width: `${rangePercent}%` }}></div>
                <div className="session-range-pointer" style={{ left: `${rangePercent}%` }}></div>
              </div>
            </div>
          )}
        </div>

        <div className="chart-controls">
          <div className="chart-style-selector">
            <button
              onClick={() => setChartType('line')}
              className={`style-btn ${chartType === 'line' ? 'active' : ''}`}
              title="Line Chart"
            >
              <i className="fa-solid fa-chart-line"></i> Line
            </button>
            <button
              onClick={() => setChartType('candle')}
              className={`style-btn ${chartType === 'candle' ? 'active' : ''}`}
              title="Candlestick Chart"
            >
              <i className="fa-solid fa-chart-simple"></i> Candle
            </button>
          </div>

          <div className="indicator-toggle-group">
            <button
              onClick={() => toggleIndicator('volume')}
              className={`indicator-btn ${indicators.volume ? 'active' : ''}`}
              title="Toggle Volume Histogram"
            >
              <span className="indicator-dot vol"></span> VOL
            </button>
            <button
              onClick={() => toggleIndicator('ema20')}
              className={`indicator-btn ${indicators.ema20 ? 'active' : ''}`}
              title="Toggle 20 Exponential Moving Average"
            >
              <span className="indicator-dot ema"></span> EMA 20
            </button>
            <button
              onClick={() => toggleIndicator('sma50')}
              className={`indicator-btn ${indicators.sma50 ? 'active' : ''}`}
              title="Toggle 50 Simple Moving Average"
            >
              <span className="indicator-dot sma"></span> SMA 50
            </button>
          </div>

          <div className="range-selector">
            {['1D', '1W', '1M', '1Y', '5Y'].map((r) => (
              <button
                key={r}
                onClick={() => handleRangeChange(r)}
                className={`range-btn ${range === r ? 'active' : ''}`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="interval-selector">
            {['1m', '5m', '15m', '1h', '1d', '1w'].map((i) => {
              const allowed = RANGE_INTERVALS[range]?.allowed.includes(i);
              return (
                <button
                  key={i}
                  disabled={!allowed}
                  onClick={() => handleIntervalChange(i)}
                  className={`interval-btn ${interval === i ? 'active' : ''}`}
                >
                  {i === '1h' ? '1H' : i === '1d' ? '1D' : i === '1w' ? '1W' : i}
                </button>
              );
            })}
          </div>

          <div className="toggle-container sr-toggle-container">
            <label className="switch">
              <input
                type="checkbox"
                checked={showLevels}
                onChange={(e) => setShowLevels(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
            <span className="sr-label">
              S&R Overlay
            </span>
          </div>

          <div className="zoom-container">
            <i className="fa-solid fa-magnifying-glass zoom-icon"></i>
            <input
              type="range"
              min="20"
              max="100"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseInt(e.target.value))}
              className="zoom-slider"
            />
            <span className="zoom-value tabular-nums">
              {zoomLevel}%
            </span>
          </div>
        </div>
      </div>

      <div className={`chart-container ${isLoading ? 'loading' : ''}`} style={isFullscreen ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: 'none', height: '100%', overflow: 'hidden' } : {}}>
        <div className="chart-wrapper" style={{ flex: 1, minHeight: 0, position: 'relative', height: isFullscreen ? '100%' : undefined }}>
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }}></div>

          {hoverData && (
            <div className="chart-hover-overlay">
              <div className="hover-primary-metric">
                <i className="fa-solid fa-crosshairs hover-icon"></i>
                <span className="hover-label">Price:</span>
                <span className="hover-val tabular-nums" style={{ color: 'var(--cyan)' }}>
                  {formatMoney(activeHoverValue, tickerCurrency)}
                </span>
              </div>

              {hoverData.open !== undefined && (
                <div className="hover-ohlc-group tabular-nums">
                  <span>O: <strong>{formatMoney(hoverData.open, tickerCurrency)}</strong></span>
                  <span>H: <strong style={{ color: 'var(--bullish)' }}>{formatMoney(hoverData.high, tickerCurrency)}</strong></span>
                  <span>L: <strong style={{ color: 'var(--bearish)' }}>{formatMoney(hoverData.low, tickerCurrency)}</strong></span>
                  <span>C: <strong>{formatMoney(hoverData.close, tickerCurrency)}</strong></span>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="btn-fullscreen-toggle"
            title={isFullscreen ? "Exit Fullscreen" : "Expand to Fullscreen"}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Expand to Fullscreen"}
          >
            <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
            <span>{isFullscreen ? 'Exit' : 'Full Screen'}</span>
          </button>

          {formattedData.length === 0 && (
            <div className="chart-loading-overlay">
              <div className="loading-spinner"></div>
              <span>Retrieving Live {activeTicker} Market Data...</span>
            </div>
          )}
        </div>
        {showLevels && (
          <div className="chart-instructions">
            <i className="fa-solid fa-circle-info"></i>{' '}
            {hoverPrice !== null ? (
              <span style={{ color: hoverPrice > activeStock.price ? 'var(--bearish)' : 'var(--bullish)', fontWeight: 700 }}>
                Click to add {hoverPrice > activeStock.price ? 'Resistance' : 'Support'} at {formatMoney(hoverPrice, tickerCurrency)}
              </span>
            ) : (
              "Click anywhere on the chart canvas to add a Support or Resistance level"
            )}
          </div>
        )}
      </div>

      {!isFullscreen && (
        <StockInsights
          key={activeTicker}
          activeTicker={activeTicker}
          currentPrice={activeStock.price}
          historicalData={formattedData}
        />
      )}
    </section>
  );
}
