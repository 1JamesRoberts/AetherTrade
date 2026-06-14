import React, { useRef, useEffect, useState } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

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
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  // Maintain canvas interactive states in refs to prevent excessive React re-renders on mousemove/wheel/drag
  const chartStartIndexRef = useRef(undefined);
  const chartEndIndexRef = useRef(undefined);
  const chartLastLengthRef = useRef(0);
  const hoverPriceRef = useRef(null);
  const isMouseDownRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartStartIndexRef = useRef(0);
  const dragStartEndIndexRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const slicedRawRef = useRef([]);
  const hoverXRef = useRef(null);

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

  const currentPrice = activeStock.price;
  const liveCloses = activeStock.liveCloses || [];
  const timeframeChange = liveCloses.length > 1
    ? ((liveCloses[liveCloses.length - 1] - liveCloses[0]) / liveCloses[0]) * 100
    : 0;
  const displayChange = timeframeChange;
  const isUp = displayChange >= 0;

  // Handle Range modifications
  const handleRangeChange = (targetRange) => {
    setRange(targetRange);
    setZoomLevel(100);

    // Enforce Webull restriction constraints
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

  // Synchronize index slicing logic on data, zoom, or symbol change
  const totalLength = activeStock.liveCloses.length;
  if (chartStartIndexRef.current === undefined || chartEndIndexRef.current === undefined || chartLastLengthRef.current !== totalLength) {
    chartEndIndexRef.current = totalLength;
    const visibleCount = Math.max(5, Math.round((totalLength * zoomLevel) / 100));
    chartStartIndexRef.current = Math.max(0, chartEndIndexRef.current - visibleCount);
    chartLastLengthRef.current = totalLength;
  }

  // Effect to instantiate and manage Chart.js instance lifecycle
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Destroy existing chart instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    if (totalLength === 0) {
      // Draw dynamic retrieving message on empty history
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.fillStyle = '#00f0ff';
      ctx.font = '600 14px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(0, 240, 255, 0.4)';
      ctx.fillText(`Retrieving Live ${activeTicker} Market Data...`, canvas.width / 2, canvas.height / 2);
      ctx.restore();
      return;
    }

    // Candle wicks generation logic if raw values are missing
    let rawValues = activeStock.liveRawValues || [];
    if (rawValues.length === 0 && activeStock.liveCloses.length > 0) {
      const closes = activeStock.liveCloses;
      const labels = activeStock.liveLabels;
      rawValues = closes.map((c, idx) => {
        const prev = idx > 0 ? closes[idx - 1] : c * 0.985;
        const o = parseFloat(prev.toFixed(2));
        const cl = parseFloat(c.toFixed(2));
        const spread = Math.abs(cl - o) || c * 0.005;
        const h = parseFloat((Math.max(o, cl) + Math.random() * spread * 0.5).toFixed(2));
        const l = parseFloat((Math.min(o, cl) - Math.random() * spread * 0.5).toFixed(2));
        return { open: o, close: cl, high: h, low: l, datetime: labels[idx] };
      });
    }

    // Visible window slicing parameters
    const startIdx = chartStartIndexRef.current;
    const endIdx = chartEndIndexRef.current;

    const slicedCloses = activeStock.liveCloses.slice(startIdx, endIdx);
    const slicedLabels = activeStock.liveLabels.slice(startIdx, endIdx);
    const slicedRaw = rawValues.slice(startIdx, endIdx);
    slicedRawRef.current = slicedRaw;

    // Compute range bound limits
    let minVal = 0;
    let maxVal = 0;
    if (chartType === 'candle' && slicedRaw.length > 0) {
      minVal = Math.min(...slicedRaw.map(v => parseFloat(v.low)));
      maxVal = Math.max(...slicedRaw.map(v => parseFloat(v.high)));
    } else if (slicedCloses.length > 0) {
      minVal = Math.min(...slicedCloses);
      maxVal = Math.max(...slicedCloses);
    }

    const verticalSpread = maxVal - minVal;
    const marginPadding = verticalSpread * 0.2 || minVal * 0.03;
    const yMinBound = Math.max(0, parseFloat((minVal - marginPadding).toFixed(2)));
    const yMaxBound = parseFloat((maxVal + marginPadding).toFixed(2));

    const timeframeChange = slicedCloses.length > 1
      ? ((slicedCloses[slicedCloses.length - 1] - slicedCloses[0]) / slicedCloses[0]) * 100
      : 0;
    const color = timeframeChange >= 0 ? '#00e676' : '#ff1744';
    const glow = timeframeChange >= 0 ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)';

    let datasetConfig = {};
    let resolvedChartType = 'line';

    if (chartType === 'candle') {
      resolvedChartType = 'bar';
      datasetConfig = {
        label: activeTicker,
        data: slicedRaw.map(v => [
          Math.min(parseFloat(v.open), parseFloat(v.close)),
          Math.max(parseFloat(v.open), parseFloat(v.close))
        ]),
        backgroundColor: slicedRaw.map(v => parseFloat(v.close) >= parseFloat(v.open) ? 'rgba(0, 230, 118, 0.75)' : 'rgba(255, 23, 68, 0.75)'),
        borderColor: slicedRaw.map(v => parseFloat(v.close) >= parseFloat(v.open) ? '#00e676' : '#ff1744'),
        borderWidth: 1.5,
        borderSkipped: false,
        barPercentage: 0.65
      };
    } else {
      resolvedChartType = 'line';
      const gradient = ctx.createLinearGradient(0, 0, 0, 400);
      gradient.addColorStop(0, glow);
      gradient.addColorStop(1, 'rgba(2, 4, 10, 0)');

      datasetConfig = {
        label: activeTicker,
        data: slicedCloses,
        borderColor: color,
        borderWidth: 2.5,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHitRadius: 0
      };
    }

    // Custom S&R Drawing Plugin
    const horizontalLinesPlugin = {
      id: 'horizontalLines',
      afterDraw(chart) {
        if (!showLevels) return;

        const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
        ctx.save();

        // Draw Current Price Level (NOW reference dash line)
        const currentPriceY = y.getPixelForValue(currentPrice);
        if (currentPriceY >= top && currentPriceY <= bottom) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(left, currentPriceY);
          ctx.lineTo(right, currentPriceY);
          ctx.stroke();

          // Price Tag Background
          ctx.fillStyle = 'rgba(6, 9, 18, 0.9)';
          ctx.fillRect(right + 5, currentPriceY - 10, 75, 20);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = '700 10px var(--font-mono)';
          ctx.fillText(`NOW: $${currentPrice.toFixed(2)}`, right + 10, currentPriceY + 4);
        }

        // Draw Drawn S&R Levels
        const lines = linesMap[activeTicker] || [];
        lines.forEach(linePrice => {
          const lineY = y.getPixelForValue(linePrice);
          if (lineY >= top && lineY <= bottom) {
            const isResistance = linePrice > currentPrice;
            ctx.strokeStyle = isResistance ? '#ff1744' : '#00e676';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(left, lineY);
            ctx.lineTo(right, lineY);
            ctx.stroke();

            // Badge Background
            ctx.fillStyle = isResistance ? '#ff1744' : '#00e676';
            const labelText = `${isResistance ? 'RES' : 'SUP'} $${linePrice.toFixed(2)}`;
            ctx.font = '700 11px var(--font-mono)';
            const textWidth = ctx.measureText(labelText).width;

            ctx.beginPath();
            ctx.roundRect(left + 8, lineY - 11, textWidth + 12, 22, 6);
            ctx.fill();

            // Text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, left + 14, lineY + 4);
          }
        });

        // Draw Hover Helper Guide Line
        if (hoverPriceRef.current !== null) {
          const hoverY = y.getPixelForValue(hoverPriceRef.current);
          if (hoverY >= top && hoverY <= bottom) {
            const isHoverResistance = hoverPriceRef.current > currentPrice;
            ctx.strokeStyle = isHoverResistance ? 'rgba(255, 23, 68, 0.45)' : 'rgba(0, 230, 118, 0.45)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(left, hoverY);
            ctx.lineTo(right, hoverY);
            ctx.stroke();

            ctx.fillStyle = isHoverResistance ? 'rgba(255, 23, 68, 0.9)' : 'rgba(0, 230, 118, 0.9)';
            const guideText = `Click to add ${isHoverResistance ? 'Resistance' : 'Support'} at $${hoverPriceRef.current.toFixed(2)}`;
            ctx.font = '600 10px var(--font-mono)';
            const textWidth = ctx.measureText(guideText).width;

            ctx.beginPath();
            ctx.roundRect(left + 8, hoverY - 9, textWidth + 12, 18, 4);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.fillText(guideText, left + 14, hoverY + 3);
          }
        }

        ctx.restore();
      }
    };

    // Custom Candlestick Wicks Plugin
    // Vertical crosshair line plugin
    const verticalLinePlugin = {
      id: 'verticalLine',
      afterDraw(chart) {
        if (hoverXRef.current === null) return;
        const { ctx, chartArea } = chart;
        const { top, bottom } = chartArea;
        const x = hoverXRef.current;
        if (x < chartArea.left || x > chartArea.right) return;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.restore();
      }
    };

    const candlestickWicksPlugin = {
      id: 'candlestickWicks',
      afterDatasetsDraw(chart) {
        if (chartType !== 'candle') return;

        const { ctx, chartArea } = chart;
        const meta = chart.getDatasetMeta(0);
        ctx.save();

        ctx.beginPath();
        ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
        ctx.clip();

        meta.data.forEach((bar, index) => {
          const raw = slicedRawRef.current[index];
          if (!raw) return;

          const high = parseFloat(raw.high);
          const low = parseFloat(raw.low);
          const close = parseFloat(raw.close);
          const open = parseFloat(raw.open);

          const isBullish = close >= open;
          ctx.strokeStyle = isBullish ? '#00e676' : '#ff1744';
          ctx.lineWidth = 1.5;

          const bodyHigh = Math.max(open, close);
          const bodyLow = Math.min(open, close);
          const bodyPixelTop = Math.min(bar.y, bar.base);
          const bodyPixelBottom = Math.max(bar.y, bar.base);
          const range = bodyHigh - bodyLow || 0.01;
          const ppv = (bodyPixelBottom - bodyPixelTop) / range;

          const wickTopY = bodyPixelTop - (high - bodyHigh) * ppv;
          const wickBottomY = bodyPixelBottom + (bodyLow - low) * ppv;

          ctx.beginPath();
          ctx.moveTo(bar.x, wickTopY);
          ctx.lineTo(bar.x, wickBottomY);
          ctx.stroke();
        });

        ctx.restore();
      }
    };

    // Instantiate Chart.js
    chartInstanceRef.current = new Chart(ctx, {
      type: resolvedChartType,
      data: {
        labels: slicedLabels,
        datasets: [datasetConfig]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            right: 85
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        elements: {
          point: {
            radius: 0
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#060912',
            titleFont: { family: 'Outfit', size: 12, weight: '700' },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            borderColor: 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: function (context) {
                if (chartType === 'candle') {
                  const idx = context.dataIndex;
                  const rawObj = slicedRaw[idx];
                  if (rawObj) {
                    return [
                      `Open:  $${parseFloat(rawObj.open).toFixed(2)}`,
                      `High:  $${parseFloat(rawObj.high).toFixed(2)}`,
                      `Low:   $${parseFloat(rawObj.low).toFixed(2)}`,
                      `Close: $${parseFloat(rawObj.close).toFixed(2)}`
                    ];
                  }
                }
                return `Price: $${context.raw.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Plus Jakarta Sans', size: 11, weight: '500' },
              maxTicksLimit: 8
            }
          },
          y: {
            position: 'right',
            grid: {
              color: 'rgba(255, 255, 255, 0.02)'
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'JetBrains Mono', size: 11, weight: '500' },
              callback: function (val) {
                return '$' + val;
              }
            },
            min: yMinBound,
            max: yMaxBound
          }
        }
      },
      plugins: [horizontalLinesPlugin, verticalLinePlugin, candlestickWicksPlugin]
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [activeTicker, chartType, showLevels, totalLength, linesMap, stocks]);

  // Event handlers registration inside canvas bindings to preserve performance and avoid re-renders
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Redraw function helper
    const triggerChartUpdate = () => {
      const chart = chartInstanceRef.current;
      if (!chart) return;

      const rawValues = activeStock.liveRawValues || [];
      const slicedCloses = activeStock.liveCloses.slice(chartStartIndexRef.current, chartEndIndexRef.current);
      const slicedLabels = activeStock.liveLabels.slice(chartStartIndexRef.current, chartEndIndexRef.current);
      const slicedRaw = rawValues.slice(chartStartIndexRef.current, chartEndIndexRef.current);
      slicedRawRef.current = slicedRaw;

      chart.data.labels = slicedLabels;
      if (chartType === 'candle') {
        chart.data.datasets[0].data = slicedRaw.map(v => [
          Math.min(parseFloat(v.open), parseFloat(v.close)),
          Math.max(parseFloat(v.open), parseFloat(v.close))
        ]);
        chart.data.datasets[0].backgroundColor = slicedRaw.map(v => parseFloat(v.close) >= parseFloat(v.open) ? 'rgba(0, 230, 118, 0.75)' : 'rgba(255, 23, 68, 0.75)');
        chart.data.datasets[0].borderColor = slicedRaw.map(v => parseFloat(v.close) >= parseFloat(v.open) ? '#00e676' : '#ff1744');
      } else {
        chart.data.datasets[0].data = slicedCloses;
        chart.data.datasets[0].pointRadius = 0;
      }

      // Re-scale boundaries
      let minVal = 0, maxVal = 0;
      if (chartType === 'candle' && slicedRaw.length > 0) {
        minVal = Math.min(...slicedRaw.map(v => parseFloat(v.low)));
        maxVal = Math.max(...slicedRaw.map(v => parseFloat(v.high)));
      } else if (slicedCloses.length > 0) {
        minVal = Math.min(...slicedCloses);
        maxVal = Math.max(...slicedCloses);
      }

      const verticalSpread = maxVal - minVal;
      const marginPadding = verticalSpread * 0.2 || minVal * 0.03;
      chart.scales.y.options.min = Math.max(0, parseFloat((minVal - marginPadding).toFixed(2)));
      chart.scales.y.options.max = parseFloat((maxVal + marginPadding).toFixed(2));

      chart.update('none');
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      isMouseDownRef.current = true;
      dragStartXRef.current = e.clientX;
      dragStartStartIndexRef.current = chartStartIndexRef.current;
      dragStartEndIndexRef.current = chartEndIndexRef.current;
      hasDraggedRef.current = false;
    };

    const onMouseMove = (e) => {
      const chart = chartInstanceRef.current;
      if (!chart) return;

      const rect = canvas.getBoundingClientRect();
      const hoverX = e.clientX - rect.left;
      const hoverY = e.clientY - rect.top;
      const chartArea = chart.chartArea;

      if (hoverX >= chartArea.left && hoverX <= chartArea.right) {
        hoverXRef.current = hoverX;
      } else {
        hoverXRef.current = null;
      }

      if (!isMouseDownRef.current) {
        // Handle hovering guide line preview
        if (showLevels) {
          const yValue = chart.scales.y.getValueForPixel(hoverY);
          if (yValue !== undefined && yValue >= chart.scales.y.min && yValue <= chart.scales.y.max) {
            hoverPriceRef.current = parseFloat(yValue.toFixed(2));
          } else {
            hoverPriceRef.current = null;
          }
        }
        chart.draw();
        return;
      }

      // Handle Panning/Dragging
      const deltaX = e.clientX - dragStartXRef.current;
      if (Math.abs(deltaX) > 5) {
        hasDraggedRef.current = true;
      }

      if (hasDraggedRef.current) {
        const chartArea = chart.chartArea;
        const totalVisible = dragStartEndIndexRef.current - dragStartStartIndexRef.current;
        const barWidth = chartArea.width / totalVisible;
        const barsDragged = Math.round(deltaX / barWidth);
        const shift = -barsDragged;

        let newStart = dragStartStartIndexRef.current + shift;
        let newEnd = dragStartEndIndexRef.current + shift;

        if (newStart < 0) {
          newStart = 0;
          newEnd = totalVisible;
        }
        if (newEnd > totalLength) {
          newEnd = totalLength;
          newStart = totalLength - totalVisible;
        }

        if (newStart !== chartStartIndexRef.current || newEnd !== chartEndIndexRef.current) {
          chartStartIndexRef.current = newStart;
          chartEndIndexRef.current = newEnd;
          triggerChartUpdate();
        }
      }
    };

    const onMouseUp = (e) => {
      if (!isMouseDownRef.current) return;
      isMouseDownRef.current = false;

      const chart = chartInstanceRef.current;
      if (!chart) return;

      // Click to draw line logic if not dragged
      if (!hasDraggedRef.current && showLevels) {
        const rect = canvas.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const yValue = chart.scales.y.getValueForPixel(clickY);

        if (yValue !== undefined && yValue >= chart.scales.y.min && yValue <= chart.scales.y.max) {
          const clickedPrice = parseFloat(yValue.toFixed(2));
          const existingLines = linesMap[activeTicker] || [];
          
          // Floating-point safety delta bound checks
          const isDuplicate = existingLines.some(price => Math.abs(price - clickedPrice) < (activeStock.price * 0.003));
          if (!isDuplicate) {
            const newLines = [...existingLines, clickedPrice];
            setLinesMap({
              ...linesMap,
              [activeTicker]: newLines
            });
          }
        }
      }
    };

    const onMouseLeave = () => {
      isMouseDownRef.current = false;
      hoverPriceRef.current = null;
      hoverXRef.current = null;
      if (chartInstanceRef.current) {
        chartInstanceRef.current.draw();
      }
    };

    // Scroll centered wheel zoom
    const onWheel = (e) => {
      e.preventDefault();
      const chart = chartInstanceRef.current;
      if (!chart) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const chartArea = chart.chartArea;
      if (mouseX < chartArea.left || mouseX > chartArea.right) return;

      const currentVisible = chartEndIndexRef.current - chartStartIndexRef.current;
      const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1;

      let newVisible = Math.round(currentVisible * zoomFactor);
      newVisible = Math.max(5, Math.min(totalLength, newVisible));

      if (newVisible === currentVisible) return;

      const localIndex = chart.scales.x.getValueForPixel(mouseX);
      let hoverIndex = chartStartIndexRef.current + Math.round(localIndex);
      if (isNaN(hoverIndex) || hoverIndex < 0 || hoverIndex >= totalLength) {
        hoverIndex = Math.round((chartStartIndexRef.current + chartEndIndexRef.current) / 2);
      }

      const ratio = (hoverIndex - chartStartIndexRef.current) / currentVisible;
      let newStart = Math.round(hoverIndex - ratio * newVisible);
      let newEnd = newStart + newVisible;

      if (newStart < 0) {
        newStart = 0;
        newEnd = newVisible;
      }
      if (newEnd > totalLength) {
        newEnd = totalLength;
        newStart = totalLength - newVisible;
      }

      chartStartIndexRef.current = newStart;
      chartEndIndexRef.current = newEnd;

      const percentage = Math.round((newVisible / totalLength) * 100);
      setZoomLevel(percentage);
      triggerChartUpdate();
    };

    // Touch event binders
    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      isMouseDownRef.current = true;
      dragStartXRef.current = e.touches[0].clientX;
      dragStartStartIndexRef.current = chartStartIndexRef.current;
      dragStartEndIndexRef.current = chartEndIndexRef.current;
      hasDraggedRef.current = false;
    };

    const onTouchMove = (e) => {
      if (!isMouseDownRef.current || e.touches.length !== 1) return;
      const chart = chartInstanceRef.current;
      if (!chart) return;

      const clientX = e.touches[0].clientX;
      const deltaX = clientX - dragStartXRef.current;
      if (Math.abs(deltaX) > 5) {
        hasDraggedRef.current = true;
      }

      if (hasDraggedRef.current) {
        const chartArea = chart.chartArea;
        const totalVisible = dragStartEndIndexRef.current - dragStartStartIndexRef.current;
        const barWidth = chartArea.width / totalVisible;
        const barsDragged = Math.round(deltaX / barWidth);
        const shift = -barsDragged;

        let newStart = dragStartStartIndexRef.current + shift;
        let newEnd = dragStartEndIndexRef.current + shift;

        if (newStart < 0) {
          newStart = 0;
          newEnd = totalVisible;
        }
        if (newEnd > totalLength) {
          newEnd = totalLength;
          newStart = totalLength - totalVisible;
        }

        if (newStart !== chartStartIndexRef.current || newEnd !== chartEndIndexRef.current) {
          chartStartIndexRef.current = newStart;
          chartEndIndexRef.current = newEnd;
          triggerChartUpdate();
        }
      }
    };

    const onTouchEnd = () => {
      isMouseDownRef.current = false;
    };

    // Bind event listeners
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [activeStock, chartType, showLevels, totalLength, linesMap, activeTicker]);

  return (
    <section className="panel panel-center" aria-label="Interactive Charting Terminal">
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
              <span className={`stock-trend ${isUp ? 'positive' : 'negative'}`} id="activeChange">
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
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setZoomLevel(val);
                if (totalLength > 0) {
                  const visibleCount = Math.max(5, Math.round((totalLength * val) / 100));
                  chartStartIndexRef.current = Math.max(0, chartEndIndexRef.current - visibleCount);
                }
              }}
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
        <canvas ref={canvasRef} id="mainChart"></canvas>
        <div className="chart-instructions">
          <i className="fa-solid fa-circle-info"></i> Click anywhere on the chart canvas to add a Support or Resistance level
        </div>
      </div>
    </section>
  );
}
