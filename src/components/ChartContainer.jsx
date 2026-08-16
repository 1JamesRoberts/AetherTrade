import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { createChart, AreaSeries, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';

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
  const [hoveredExistingLine, setHoveredExistingLine] = useState(null);
  const [lineCoordinates, setLineCoordinates] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [indicators, setIndicators] = useState({
    volume: true,
    ema20: false,
    sma50: false,
  });

  const toggleIndicator = (key) => {
    setIndicators(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateLineCoords = useCallback(() => {
    try {
      if (!seriesRef.current || !chartContainerRef.current || !chartInstanceRef.current) {
        setLineCoordinates([]);
        return;
      }
      const currentLines = linesMap[activeTicker] || [];
      if (!currentLines.length) {
        setLineCoordinates([]);
        return;
      }
      const containerHeight = chartContainerRef.current.clientHeight || 400;

      const coords = [];
      for (const price of currentLines) {
        try {
          const y = seriesRef.current.priceToCoordinate(price);
          if (y !== null && y !== undefined && !isNaN(y) && y >= 5 && y <= containerHeight - 15) {
            coords.push({
              price,
              y,
              isRes: price > (activeStock?.price || 0)
            });
          }
        } catch (_) {
          // ignore single line error
        }
      }
      setLineCoordinates(coords);
    } catch (_) {
      // safe fallback
    }
  }, [linesMap, activeTicker, activeStock?.price]);

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
    let dataPoints = [];

    if (rawValues.length === 0 && activeStock.liveCloses.length > 0) {
      const closes = activeStock.liveCloses;
      const labels = activeStock.liveLabels;
      dataPoints = closes.map((c, idx) => {
        const prev = idx > 0 ? closes[idx - 1] : c * 0.985;
        const o = parseFloat(prev.toFixed(2));
        const cl = parseFloat(c.toFixed(2));
        const spread = Math.abs(cl - o) || c * 0.005;
        const h = parseFloat((Math.max(o, cl) + Math.random() * spread * 0.5).toFixed(2));
        const l = parseFloat((Math.min(o, cl) - Math.random() * spread * 0.5).toFixed(2));
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
    if (!hoverData) return hoverPrice;
    if (hoverData.close !== undefined) return hoverData.close;
    if (hoverData.value !== undefined) return hoverData.value;
    return hoverPrice;
  }, [hoverData, hoverPrice]);

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

  useEffect(() => {
    if (!chartContainerRef.current || formattedData.length === 0) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: '"Outfit", sans-serif',
      },
      localization: {
        timeFormatter: (timestamp) => {
          if (range === '1D' && formattedData.length > 0 && timestamp === formattedData[0].time) {
            return 'Prev Close';
          }
          const d = new Date(timestamp * 1000);
          if (interval === '1d') {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }
          if (interval === '1w') {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
          }
          if (range !== '1D') {
            const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `${datePart}  ${timePart}`;
          }
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        textColor: '#94a3b8',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: interval !== '1d' && interval !== '1w',
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          if (range === '1D' && formattedData.length > 0 && time === formattedData[0].time) {
            return 'Prev Close';
          }
          const d = new Date(time * 1000);
          if (interval === '1d') {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }
          if (interval === '1w') {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
          }
          if (range !== '1D') {
            const hour = d.getHours();
            const minute = d.getMinutes();
            if (hour === 0 && minute === 0) {
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.3)',
          width: 1,
          style: 1,
          labelBackgroundColor: '#060912',
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.3)',
          width: 1,
          style: 1,
          labelBackgroundColor: '#060912',
        },
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseDrag: true,
        touchDrag: true,
      },
    });

    chartInstanceRef.current = chart;

    if (indicators.volume) {
      try {
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume_scale',
        });
        chart.priceScale('volume_scale').applyOptions({
          scaleMargins: {
            top: 0.82,
            bottom: 0,
          },
        });
        const volData = calculateVolumeData(formattedData, activeStock.liveRawValues || []);
        volumeSeries.setData(volData);
      } catch (e) {
        console.warn('Volume series init skipped:', e);
      }
    }

    if (indicators.ema20) {
      try {
        const emaSeries = chart.addSeries(LineSeries, {
          color: '#06B6D4',
          lineWidth: 1.5,
          priceLineVisible: false,
          title: 'EMA 20',
        });
        const emaData = calculateEMA(formattedData, 20);
        emaSeries.setData(emaData);
      } catch (e) {
        console.warn('EMA series init skipped:', e);
      }
    }

    if (indicators.sma50) {
      try {
        const smaSeries = chart.addSeries(LineSeries, {
          color: '#F59E0B',
          lineWidth: 1.5,
          priceLineVisible: false,
          title: 'SMA 50',
        });
        const smaData = calculateSMA(formattedData, 50);
        smaSeries.setData(smaData);
      } catch (e) {
        console.warn('SMA series init skipped:', e);
      }
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
      });
    }

    seriesRef.current = series;

    try {
      series.setData(formattedData);
    } catch (err) {
      console.warn('Lightweight Charts setData skipped error:', err);
    }

    const totalLength = formattedData.length;
    const visibleCount = Math.max(5, Math.round((totalLength * zoomLevel) / 100));
    chart.timeScale().setVisibleLogicalRange({
      from: totalLength - visibleCount,
      to: totalLength - 1,
    });

    const lines = linesMap[activeTicker] || [];
    if (showLevels) {
      lines.forEach(linePrice => {
        const isResistance = linePrice > activeStock.price;
        const lineColor = isResistance ? '#F43F5E' : '#10B981';
        const labelTitle = isResistance ? `RES $${linePrice.toFixed(2)}` : `SUP $${linePrice.toFixed(2)}`;

        series.createPriceLine({
          price: linePrice,
          color: lineColor,
          lineWidth: 2,
          lineStyle: 1,
          axisLabelVisible: true,
          title: labelTitle,
        });
      });
    }

    // Click Event for adding OR deleting Support / Resistance levels
    const handleChartClick = (param) => {
      if (!showLevels || !param.point) return;
      const clickedPrice = series.coordinateToPrice(param.point.y);
      if (clickedPrice === null || clickedPrice === undefined) return;

      const roundedPrice = parseFloat(clickedPrice.toFixed(2));
      const existingLines = linesMap[activeTicker] || [];

      // Check if clicked directly on or near an existing line to delete it
      const matchedIndex = existingLines.findIndex(price => {
        const lineCoord = series.priceToCoordinate(price);
        if (lineCoord !== null && param.point.y !== undefined) {
          return Math.abs(lineCoord - param.point.y) <= 14; // 14px click target
        }
        return Math.abs(price - roundedPrice) < (activeStock.price * 0.008);
      });

      if (matchedIndex !== -1) {
        // Delete this level
        const newLines = existingLines.filter((_, idx) => idx !== matchedIndex);
        setLinesMap({
          ...linesMap,
          [activeTicker]: newLines
        });
        setHoveredExistingLine(null);
      } else {
        // Add new level
        const newLines = [...existingLines, roundedPrice];
        setLinesMap({
          ...linesMap,
          [activeTicker]: newLines
        });
      }
    };
    chart.subscribeClick(handleChartClick);

    // Crosshair Movement for hover price tracking and line deletion hint
    const handleCrosshairMove = (param) => {
      if (!param || !param.point) {
        setHoverPrice(null);
        setHoverData(null);
        setHoveredExistingLine(null);
        return;
      }
      const price = series.coordinateToPrice(param.point.y);
      setHoverPrice(price !== null ? parseFloat(price.toFixed(2)) : null);

      // Check if cursor is hovering over an existing level
      const currentLines = linesMap[activeTicker] || [];
      if (price !== null && currentLines.length > 0 && showLevels) {
        const matched = currentLines.find(l => {
          const lineCoord = series.priceToCoordinate(l);
          if (lineCoord !== null && param.point.y !== undefined) {
            return Math.abs(lineCoord - param.point.y) <= 14;
          }
          return Math.abs(l - price) < (activeStock.price * 0.008);
        });
        setHoveredExistingLine(matched !== undefined ? matched : null);
      } else {
        setHoveredExistingLine(null);
      }

      if (param.time && series) {
        const pointData = param.seriesData.get(series);
        setHoverData(pointData || null);
      } else {
        setHoverData(null);
      }
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const handleVisibleLogicalRangeChange = (logicalRange) => {
      if (isScaleUpdatingRef.current || !logicalRange) return;
      const visibleCount = logicalRange.to - logicalRange.from;
      const percent = Math.round((visibleCount / totalLength) * 100);
      const boundedPercent = Math.max(20, Math.min(100, percent));
      
      isScaleUpdatingRef.current = true;
      setZoomLevel(boundedPercent);
      updateLineCoords();
      setTimeout(() => {
        isScaleUpdatingRef.current = false;
      }, 50);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);

    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
        updateLineCoords();
      }
    };
    window.addEventListener('resize', handleResize);

    // Initial line coords calculation
    const initTimer = setTimeout(updateLineCoords, 60);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeClick(handleChartClick);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartInstanceRef.current = null;
      seriesRef.current = null;
    };
  }, [
    formattedData,
    chartType,
    showLevels,
    linesMap,
    activeTicker,
    range,
    interval,
    indicators.volume,
    indicators.ema20,
    indicators.sma50
  ]);

  // Synchronize line coordinates whenever levels, zoom or active asset change
  useEffect(() => {
    const timer = setTimeout(updateLineCoords, 50);
    return () => clearTimeout(timer);
  }, [linesMap, activeTicker, zoomLevel, showLevels, updateLineCoords]);

  useEffect(() => {
    if (!chartInstanceRef.current || formattedData.length === 0 || isScaleUpdatingRef.current) return;
    const totalLength = formattedData.length;
    const visibleCount = Math.max(5, Math.round((totalLength * zoomLevel) / 100));
    chartInstanceRef.current.timeScale().setVisibleLogicalRange({
      from: totalLength - visibleCount,
      to: totalLength - 1,
    });
    updateLineCoords();
  }, [zoomLevel, formattedData.length, updateLineCoords]);

  const rangePercent = sessionStats.high > sessionStats.low
    ? Math.max(0, Math.min(100, ((activeStock.price - sessionStats.low) / (sessionStats.high - sessionStats.low)) * 100))
    : 50;

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
                ${activeHoverValue !== null ? activeHoverValue.toFixed(2) : activeStock.price.toFixed(2)}
              </span>
              <span className={`stock-trend tabular-nums ${isUp ? 'positive' : 'negative'}`} id="activeChange" title={range === '1D' ? 'Day change relative to Yesterday Close' : `${range} change`}>
                {isUp ? '+' : ''}
                {displayChange.toFixed(2)}%
              </span>
            </div>
          </div>

          {sessionStats.high > 0 && sessionStats.low > 0 && (
            <div className="session-range-meter" title={`Range Low: $${sessionStats.low.toFixed(2)} | High: $${sessionStats.high.toFixed(2)}`}>
              <div className="session-range-labels">
                <span className="range-low">L ${sessionStats.low.toFixed(2)}</span>
                <span className="range-title">Range</span>
                <span className="range-high">H ${sessionStats.high.toFixed(2)}</span>
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
            {['1D', '1W', '1M', '1Y'].map((r) => (
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

          <div className="chart-hover-overlay">
            <div className="hover-primary-metric">
              <i className="fa-solid fa-crosshairs hover-icon"></i>
              <span className="hover-label">Price:</span>
              <span className="hover-val tabular-nums" style={{ color: activeHoverValue !== null ? 'var(--cyan)' : '#ffffff' }}>
                {activeHoverValue !== null ? `$${activeHoverValue.toFixed(2)}` : `$${activeStock.price.toFixed(2)}`}
              </span>
            </div>

            {hoverData && hoverData.open !== undefined && (
              <div className="hover-ohlc-group tabular-nums">
                <span>O: <strong>${hoverData.open.toFixed(2)}</strong></span>
                <span>H: <strong style={{ color: 'var(--bullish)' }}>${hoverData.high.toFixed(2)}</strong></span>
                <span>L: <strong style={{ color: 'var(--bearish)' }}>${hoverData.low.toFixed(2)}</strong></span>
                <span>C: <strong>${hoverData.close.toFixed(2)}</strong></span>
              </div>
            )}
          </div>

          {/* Direct On-Line Delete Action Buttons on Right Edge of Each Line */}
          {showLevels && lineCoordinates.map(({ price, y, isRes }) => (
            <div
              key={`line-del-btn-${price}`}
              className={`on-line-delete-badge ${isRes ? 'res' : 'sup'}`}
              style={{
                position: 'absolute',
                top: `${y}px`,
                right: '65px',
                transform: 'translateY(-50%)',
                zIndex: 25,
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const newLines = (linesMap[activeTicker] || []).filter(p => p !== price);
                  setLinesMap({
                    ...linesMap,
                    [activeTicker]: newLines
                  });
                }}
                className="btn-line-right-delete"
                title={`Delete ${isRes ? 'Resistance' : 'Support'} line $${price.toFixed(2)}`}
                aria-label={`Delete ${isRes ? 'Resistance' : 'Support'} line $${price.toFixed(2)}`}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          ))}

          {/* On-Chart Active Levels Quick-Delete Tags */}
          {showLevels && (linesMap[activeTicker] || []).length > 0 && (
            <div className="chart-levels-quick-bar">
              <span className="quick-bar-label">Active Levels:</span>
              <div className="quick-bar-tags-scroll">
                {(linesMap[activeTicker] || []).map(p => {
                  const isRes = p > activeStock.price;
                  return (
                    <span key={`quick-lvl-${p}`} className={`chart-level-tag ${isRes ? 'res' : 'sup'} tabular-nums`}>
                      {isRes ? 'RES' : 'SUP'} ${p.toFixed(2)}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newLines = (linesMap[activeTicker] || []).filter(l => l !== p);
                          setLinesMap({ ...linesMap, [activeTicker]: newLines });
                        }}
                        className="chart-level-tag-del"
                        title={`Delete level $${p.toFixed(2)}`}
                        aria-label={`Delete level $${p.toFixed(2)}`}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </span>
                  );
                })}
              </div>
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
        <div className="chart-instructions">
          <i className="fa-solid fa-circle-info"></i>{' '}
          {hoveredExistingLine !== null ? (
            <span className="text-delete-hint" style={{ color: 'var(--bearish)', fontWeight: 700 }}>
              <i className="fa-solid fa-trash-can" style={{ marginRight: '5px' }}></i>
              Click line to DELETE level at ${hoveredExistingLine.toFixed(2)}
            </span>
          ) : hoverPrice !== null && showLevels ? (
            <span style={{ color: hoverPrice > activeStock.price ? 'var(--bearish)' : 'var(--bullish)', fontWeight: 700 }}>
              Click on chart to add {hoverPrice > activeStock.price ? 'Resistance' : 'Support'} at ${hoverPrice.toFixed(2)}
            </span>
          ) : (
            "Click on chart to add Support/Resistance, or click directly on any line to delete it"
          )}
        </div>
      </div>
    </section>
  );
}
