import React, { useRef, useEffect, useState, useMemo } from 'react';
import { createChart, AreaSeries, CandlestickSeries } from 'lightweight-charts';

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
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!panelRef.current) return;
    if (!document.fullscreenElement) {
      if (panelRef.current.requestFullscreen) {
        panelRef.current.requestFullscreen().catch(() => setIsFullscreen(prev => !prev));
      } else {
        setIsFullscreen(prev => !prev);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else {
        setIsFullscreen(false);
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

  // Convert Twelve Data stock history into format compatible with Lightweight Charts
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
        // Daily / Weekly labels "YYYY-MM-DD"
        const dateObj = new Date(parts[0] + 'T00:00:00Z');
        t = Math.floor(dateObj.getTime() / 1000);
      } else {
        // Intraday labels "YYYY-MM-DD HH:MM:SS"
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

    // For 1D time frame on line charts: start with Yesterday Close price followed by all intraday bars of current day
    if (range === '1D' && chartType === 'line' && sorted.length > 0) {
      const currentPrice = parseFloat(activeStock.price) || sorted[sorted.length - 1].close;
      const changePct = parseFloat(activeStock.change) || 0;
      const prevClose = changePct !== 0 ? parseFloat((currentPrice / (1 + changePct / 100)).toFixed(2)) : sorted[0].open;
      const startTime = sorted[0].time - 60; // 1 minute prior to first intraday bar of today

      if (startTime > 0 && !seenTimes.has(startTime)) {
        return [
          { time: startTime, open: prevClose, high: prevClose, low: prevClose, close: prevClose, value: prevClose },
          ...sorted
        ];
      }
    }

    return sorted;
  }, [activeStock.liveRawValues, activeStock.liveCloses, activeStock.liveLabels, activeStock.price, activeStock.change, range, chartType]);

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

  const displayChange = range === '1D' ? computedChange : (activeStock.timeframeChange || computedChange || activeStock.change || 0);
  const isUp = displayChange >= 0;

  // Handle Range modifications
  const handleRangeChange = (targetRange) => {
    setRange(targetRange);
    setZoomLevel(100);

    const rangeInfo = RANGE_INTERVALS[targetRange];
    if (!rangeInfo.allowed.includes(interval)) {
      setInterval(rangeInfo.default);
    }
  };

  // Handle Interval modifications
  const handleIntervalChange = (targetInterval) => {
    setInterval(targetInterval);
    setZoomLevel(100);
  };

  // Main Effect to manage Lightweight Charts instance and updates
  useEffect(() => {
    if (!chartContainerRef.current || formattedData.length === 0) return;

    const container = chartContainerRef.current;

    // Create chart instance
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
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          if (range === '1D' && formattedData.length > 0 && time === formattedData[0].time) {
            return 'Prev Close';
          }
          const d = new Date(time * 1000);
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.3)',
          width: 1,
          style: 1, // Dashed
          labelBackgroundColor: '#060912',
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.3)',
          width: 1,
          style: 1, // Dashed
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

    // Create appropriate series based on chartType
    const seriesColor = isUp ? '#00e676' : '#ff1744';
    let series;

    if (chartType === 'candle') {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#00e676',
        downColor: '#ff1744',
        borderDownColor: '#ff1744',
        borderUpColor: '#00e676',
        wickDownColor: '#ff1744',
        wickUpColor: '#00e676',
        priceLineVisible: true,
        priceLineColor: 'rgba(255, 255, 255, 0.2)',
        priceLineStyle: 2, // Dotted
      });
    } else {
      series = chart.addSeries(AreaSeries, {
        lineColor: seriesColor,
        topColor: isUp ? 'rgba(0, 230, 118, 0.25)' : 'rgba(255, 23, 68, 0.25)',
        bottomColor: 'rgba(2, 4, 10, 0)',
        lineWidth: 2.5,
        priceLineVisible: true,
        priceLineColor: 'rgba(255, 255, 255, 0.2)',
        priceLineStyle: 2, // Dotted
      });
    }

    seriesRef.current = series;

    try {
      series.setData(formattedData);
    } catch (err) {
      console.warn('Lightweight Charts setData skipped error:', err);
    }


    // Apply initial zoom
    const totalLength = formattedData.length;
    const visibleCount = Math.max(5, Math.round((totalLength * zoomLevel) / 100));
    chart.timeScale().setVisibleLogicalRange({
      from: totalLength - visibleCount,
      to: totalLength - 1,
    });

    // Render S&R Levels
    const lines = linesMap[activeTicker] || [];
    if (showLevels) {
      lines.forEach(linePrice => {
        const isResistance = linePrice > activeStock.price;
        const lineColor = isResistance ? '#ff1744' : '#00e676';
        const labelTitle = isResistance ? `RES $${linePrice.toFixed(2)}` : `SUP $${linePrice.toFixed(2)}`;

        series.createPriceLine({
          price: linePrice,
          color: lineColor,
          lineWidth: 2,
          lineStyle: 1, // Dashed
          axisLabelVisible: true,
          title: labelTitle,
        });
      });
    }

    // Subscribe to Click Event for drawing Support / Resistance
    const handleChartClick = (param) => {
      if (!showLevels || !param.point) return;
      const clickedPrice = series.coordinateToPrice(param.point.y);
      if (clickedPrice === null || clickedPrice === undefined) return;

      const roundedPrice = parseFloat(clickedPrice.toFixed(2));
      const existingLines = linesMap[activeTicker] || [];
      const isDuplicate = existingLines.some(price => Math.abs(price - roundedPrice) < (activeStock.price * 0.003));

      if (!isDuplicate) {
        const newLines = [...existingLines, roundedPrice];
        setLinesMap({
          ...linesMap,
          [activeTicker]: newLines
        });
      }
    };
    chart.subscribeClick(handleChartClick);

    // Subscribe to Crosshair Movement for guide lines preview
    const handleCrosshairMove = (param) => {
      if (!showLevels || !param.point) {
        setHoverPrice(null);
        return;
      }
      const price = series.coordinateToPrice(param.point.y);
      setHoverPrice(price !== null ? parseFloat(price.toFixed(2)) : null);
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    // Subscribe to TimeScale changes to synchronize the Zoom Slider
    const handleVisibleLogicalRangeChange = (logicalRange) => {
      if (isScaleUpdatingRef.current || !logicalRange) return;
      const visibleCount = logicalRange.to - logicalRange.from;
      const percent = Math.round((visibleCount / totalLength) * 100);
      const boundedPercent = Math.max(20, Math.min(100, percent));
      
      isScaleUpdatingRef.current = true;
      setZoomLevel(boundedPercent);
      setTimeout(() => {
        isScaleUpdatingRef.current = false;
      }, 50);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);

    // Handle Responsive Resize
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    resizeObserver.observe(container);

    // Clean up on component unmount / update
    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartInstanceRef.current = null;
      seriesRef.current = null;
    };
  }, [activeTicker, chartType, showLevels, formattedData, linesMap, activeStock.price, isUp]);

  // Synchronize zoom changes from the slider to the chart
  useEffect(() => {
    if (isScaleUpdatingRef.current) return;
    const chart = chartInstanceRef.current;
    if (!chart || formattedData.length === 0) return;

    const totalLength = formattedData.length;
    const visibleCount = Math.max(5, Math.round((totalLength * zoomLevel) / 100));

    isScaleUpdatingRef.current = true;
    chart.timeScale().setVisibleLogicalRange({
      from: totalLength - visibleCount,
      to: totalLength - 1,
    });
    setTimeout(() => {
      isScaleUpdatingRef.current = false;
    }, 50);
  }, [zoomLevel, formattedData.length]);

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
        boxSizing: 'border-box'
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
              <span className="stock-price" id="activePrice">
                ${activeStock.price.toFixed(2)}
              </span>
              <span className={`stock-trend ${isUp ? 'positive' : 'negative'}`} id="activeChange" title={range === '1D' ? 'Day change relative to Yesterday Close' : `${range} change`}>
                {isUp ? '+' : ''}
                {displayChange.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        <div className="chart-controls">
          {/* Toggle S&R Overlay */}
          <div className="toggle-container" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label className="switch">
              <input
                type="checkbox"
                checked={showLevels}
                onChange={(e) => setShowLevels(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              S&R Overlay
            </span>
          </div>

          {/* Zoom Slider */}
          <div
            className="zoom-container"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <i className="fa-solid fa-magnifying-glass" style={{ fontSize: '11px', color: 'var(--text-muted)' }}></i>
            <input
              type="range"
              min="20"
              max="100"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseInt(e.target.value))}
              style={{
                width: '80px',
                accentColor: 'var(--cyan)',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                margin: 0,
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                width: '35px',
                textAlign: 'right',
              }}
            >
              {zoomLevel}%
            </span>
          </div>

          {/* Style Selector */}
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
              <i className="fa-solid fa-chart-bar"></i> Candle
            </button>
          </div>

          {/* Range Selector */}
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

          {/* Interval Selector */}
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
        </div>
      </div>

      {/* Chart Container */}
      <div className={`chart-container ${isLoading ? 'loading' : ''}`}>
        <div className="chart-wrapper" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }}></div>

          {/* Bottom Right Fullscreen Toggle Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="btn-fullscreen-toggle"
            title={isFullscreen ? "Exit Fullscreen" : "Expand to Fullscreen"}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Expand to Fullscreen"}
            style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              zIndex: 25,
              background: 'rgba(6, 9, 18, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border-color)',
              color: 'var(--cyan)',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              transition: 'all var(--transition-fast)'
            }}
          >
            <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
            <span>{isFullscreen ? 'Exit' : 'Full Screen'}</span>
          </button>

          {formattedData.length === 0 && (
            <div className="chart-loading-overlay" style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(6, 9, 18, 0.6)',
              backdropFilter: 'blur(8px)',
              color: 'var(--cyan)',
              fontFamily: '"Outfit", sans-serif',
              fontSize: '16px',
              fontWeight: 600,
              textShadow: '0 0 10px rgba(0, 240, 255, 0.4)',
              zIndex: 10,
              borderRadius: 'var(--radius-lg)'
            }}>
              Retrieving Live {activeTicker} Market Data...
            </div>
          )}
        </div>
        <div className="chart-instructions">
          <i className="fa-solid fa-circle-info"></i>{' '}
          {hoverPrice !== null && showLevels ? (
            <span style={{ color: hoverPrice > activeStock.price ? '#ff1744' : '#00e676', fontWeight: 700 }}>
              Click to add {hoverPrice > activeStock.price ? 'Resistance' : 'Support'} at ${hoverPrice.toFixed(2)}
            </span>
          ) : (
            "Click anywhere on the chart canvas to add a Support or Resistance level"
          )}
        </div>
      </div>
    </section>
  );
}
