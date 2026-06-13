// ==========================================================================
// CHARTS MODULE (charts.js)
// Handles Chart.js visualization, custom plugins, auto-scaling, and interactive levels
// ==========================================================================

import {
  state,
  portfolioState,
  STOCKS_METADATA,
  saveSupportResistanceLines
} from './state.js';

import {
  updateDashboard
} from '../app.js';

export let mainChart = null;
export let portfolioAllocationChartInstance = null;
export let portfolioPerformanceChartInstance = null;

export function setMainChart(value) {
  mainChart = value;
}

export function setPortfolioAllocationChartInstance(value) {
  portfolioAllocationChartInstance = value;
}

export function setPortfolioPerformanceChartInstance(value) {
  portfolioPerformanceChartInstance = value;
}

// --------------------------------------------------------------------------
// Custom Chart.js Plugins
// --------------------------------------------------------------------------

const horizontalLinesPlugin = {
  id: 'horizontalLines',
  afterDraw(chart) {
    if (!state.showLevels) return; // Skip drawing S&R lines if toggled off

    const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
    const activeStock = state.stocks[state.activeTicker];
    if (!activeStock) return;

    const currentPrice = activeStock.price;
    const lines = state.linesMap[state.activeTicker] || [];

    ctx.save();

    // Draw Current Price Level (Reference line)
    const currentPriceY = y.getPixelForValue(currentPrice);
    if (currentPriceY >= top && currentPriceY <= bottom) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(left, currentPriceY);
      ctx.lineTo(right, currentPriceY);
      ctx.stroke();

      // Current Price Label Background (outside to the right of the chart area)
      ctx.fillStyle = 'rgba(6, 9, 18, 0.9)';
      ctx.fillRect(right + 5, currentPriceY - 10, 75, 20);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '700 10px var(--font-mono)';
      ctx.fillText(`NOW: $${currentPrice.toFixed(2)}`, right + 10, currentPriceY + 4);
    }

    // Draw Support & Resistance User Lines
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

        // Level Tag Badge Background
        ctx.fillStyle = isResistance ? '#ff1744' : '#00e676';
        const labelText = `${isResistance ? 'RES' : 'SUP'} $${linePrice.toFixed(2)}`;
        ctx.font = '700 11px var(--font-mono)';
        const textWidth = ctx.measureText(labelText).width;

        ctx.beginPath();
        ctx.roundRect(left + 8, lineY - 11, textWidth + 12, 22, 6);
        ctx.fill();

        // Tag Text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, left + 14, lineY + 4);
      }
    });

    // Draw Hover Guide Line
    if (state.hoverPrice !== null) {
      const hoverY = y.getPixelForValue(state.hoverPrice);
      if (hoverY >= top && hoverY <= bottom) {
        const isHoverResistance = state.hoverPrice > currentPrice;

        ctx.strokeStyle = isHoverResistance ? 'rgba(255, 23, 68, 0.45)' : 'rgba(0, 230, 118, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(left, hoverY);
        ctx.lineTo(right, hoverY);
        ctx.stroke();

        // Draw cursor target preview tag
        ctx.fillStyle = isHoverResistance ? 'rgba(255, 23, 68, 0.9)' : 'rgba(0, 230, 118, 0.9)';
        const guideText = `Click to add ${isHoverResistance ? 'Resistance' : 'Support'} at $${state.hoverPrice.toFixed(2)}`;
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

const candlestickWicksPlugin = {
  id: 'candlestickWicks',
  afterDatasetsDraw(chart) {
    if (state.chartType !== 'candle') return;

    const { ctx, chartArea } = chart;
    const meta = chart.getDatasetMeta(0);
    const activeStock = state.stocks[state.activeTicker];
    if (!activeStock || !activeStock.liveRawValues) return;

    const rawValues = activeStock.liveRawValues.slice(state.chartStartIndex, state.chartEndIndex);

    ctx.save();

    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
    ctx.clip();

    meta.data.forEach((bar, index) => {
      const raw = rawValues[index];
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

// --------------------------------------------------------------------------
// Chart Renderers
// --------------------------------------------------------------------------

export function renderStockChartDirect() {
  const canvasElement = document.getElementById('mainChart');
  if (!canvasElement) return;

  // Immediately destroy the old chart instance to prevent multiple charts overlaying on the same canvas
  if (mainChart) {
    mainChart.destroy();
    mainChart = null;
  }

  const ctx = canvasElement.getContext('2d');
  const activeStock = state.stocks[state.activeTicker];
  if (!activeStock) return;

  // Make sure raw values exist (generate fallback candles if mock generator or Twelve Data limits was active)
  if (!activeStock.liveRawValues || activeStock.liveRawValues.length === 0) {
    const closes = activeStock.liveCloses || [];
    const labels = activeStock.liveLabels || [];
    activeStock.liveRawValues = closes.map((c, idx) => {
      const prev = idx > 0 ? closes[idx - 1] : c * 0.985;
      const o = parseFloat(prev.toFixed(2));
      const cl = parseFloat(c.toFixed(2));
      const spread = Math.abs(cl - o) || c * 0.005;
      const h = parseFloat((Math.max(o, cl) + Math.random() * spread * 0.5).toFixed(2));
      const l = parseFloat((Math.min(o, cl) - Math.random() * spread * 0.5).toFixed(2));

      return {
        open: o,
        close: cl,
        high: h,
        low: l,
        datetime: labels[idx]
      };
    });
  }

  // --- INTERACTIVE TIMEFRAME & TIMELINE ZOOM SLICING ---
  const totalLength = activeStock.liveCloses.length;
  
  if (state.chartStartIndex === undefined || state.chartEndIndex === undefined || state.chartLastLength !== totalLength) {
    state.chartEndIndex = totalLength;
    const visibleCount = Math.max(5, Math.round((totalLength * state.zoomLevel) / 100));
    state.chartStartIndex = Math.max(0, state.chartEndIndex - visibleCount);
    state.chartLastLength = totalLength;
  }

  const historyCloses = activeStock.liveCloses.slice(state.chartStartIndex, state.chartEndIndex);
  const labels = activeStock.liveLabels.slice(state.chartStartIndex, state.chartEndIndex);
  const rawValues = activeStock.liveRawValues.slice(state.chartStartIndex, state.chartEndIndex);

  // --- DYNAMIC Y-AXIS AUTO-SCALING ---
  let minVal = 0;
  let maxVal = 0;

  if (state.chartType === 'candle') {
    minVal = Math.min(...rawValues.map(v => parseFloat(v.low)));
    maxVal = Math.max(...rawValues.map(v => parseFloat(v.high)));
  } else {
    minVal = Math.min(...historyCloses);
    maxVal = Math.max(...historyCloses);
  }

  const verticalSpread = maxVal - minVal;
  const marginPadding = verticalSpread * 0.2 || minVal * 0.03;

  const yMinBound = Math.max(0, parseFloat((minVal - marginPadding).toFixed(2)));
  const yMaxBound = parseFloat((maxVal + marginPadding).toFixed(2));

  const color = activeStock.change >= 0 ? '#00e676' : '#ff1744';
  const glow = activeStock.change >= 0 ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 23, 68, 0.12)';

  let datasetConfig = {};
  let chartType = 'line';

  if (state.chartType === 'candle') {
    chartType = 'bar';
    datasetConfig = {
      label: activeStock.ticker,
      // CRITICAL FIX: Ensure floating bars are always represented as [min, max] so Chart.js renders correctly!
      data: rawValues.map(v => [
        Math.min(parseFloat(v.open), parseFloat(v.close)),
        Math.max(parseFloat(v.open), parseFloat(v.close))
      ]),
      backgroundColor: rawValues.map(v => parseFloat(v.close) >= parseFloat(v.open) ? 'rgba(0, 230, 118, 0.75)' : 'rgba(255, 23, 68, 0.75)'),
      borderColor: rawValues.map(v => parseFloat(v.close) >= parseFloat(v.open) ? '#00e676' : '#ff1744'),
      borderWidth: 1.5,
      borderSkipped: false,
      barPercentage: 0.65
    };
  } else {
    chartType = 'line';
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, glow);
    gradient.addColorStop(1, 'rgba(2, 4, 10, 0)');

    datasetConfig = {
      label: activeStock.ticker,
      data: historyCloses,
      borderColor: color,
      borderWidth: 2.5,
      backgroundColor: gradient,
      fill: true,
      tension: 0.35,
      pointRadius: 0, // Invisible by default
      pointHoverRadius: 8, // Enlarged glowing hover dot
      pointHoverBackgroundColor: color,
      pointHoverBorderColor: '#fff', // White glow border on hover
      pointHoverBorderWidth: 2.5, // Thick hover border
      pointHitRadius: 10 // Easily trigger hover dot visibility
    };
  }

  // Create the new chart in the next execution tick to allow the browser to complete
  // canvas destruction and trigger reflows. This avoids vertical/horizontal squeeze glitches.
  setTimeout(() => {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    const currentCtx = canvas.getContext('2d');

    mainChart = new Chart(currentCtx, {
      type: chartType,
      data: {
        labels: labels,
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
          intersect: false,
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
                if (state.chartType === 'candle') {
                  const idx = context.dataIndex;
                  const rawObj = rawValues[idx];
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
              callback: function (value) {
                return '$' + value;
              }
            },
            min: yMinBound,
            max: yMaxBound
          }
        },
        onHover: (event, activeElements) => {
          if (!mainChart || !state.showLevels || isMouseDown) {
            state.hoverPrice = null;
            return;
          }
          const yValue = mainChart.scales.y.getValueForPixel(event.y);

          if (yValue !== undefined && yValue >= mainChart.scales.y.min && yValue <= mainChart.scales.y.max) {
            state.hoverPrice = parseFloat(yValue.toFixed(2));
            mainChart.draw();
          } else {
            state.hoverPrice = null;
          }
        }
      },
      plugins: [horizontalLinesPlugin, candlestickWicksPlugin]
    });

    let isMouseDown = false;
    let dragStartX = 0;
    let dragStartStartIndex = 0;
    let dragStartEndIndex = 0;
    let hasDragged = false;

    canvas.onmousedown = (e) => {
      if (e.button !== 0) return; // Only left click
      isMouseDown = true;
      dragStartX = e.clientX;
      dragStartStartIndex = state.chartStartIndex;
      dragStartEndIndex = state.chartEndIndex;
      hasDragged = false;
    };

    canvas.onmousemove = (e) => {
      // 1. Hover Guide Line (only when not dragging)
      if (mainChart && state.showLevels && !isMouseDown) {
        const rect = canvas.getBoundingClientRect();
        const hoverY = e.clientY - rect.top;
        const yValue = mainChart.scales.y.getValueForPixel(hoverY);
        if (yValue !== undefined && yValue >= mainChart.scales.y.min && yValue <= mainChart.scales.y.max) {
          state.hoverPrice = parseFloat(yValue.toFixed(2));
          mainChart.draw();
        } else {
          state.hoverPrice = null;
        }
      }

      // 2. Drag/Pan logic
      if (!isMouseDown) return;
      const deltaX = e.clientX - dragStartX;
      if (Math.abs(deltaX) > 5) {
        hasDragged = true;
      }

      if (hasDragged && mainChart) {
        const chartArea = mainChart.chartArea;
        const totalVisible = dragStartEndIndex - dragStartStartIndex;
        const barWidth = chartArea.width / totalVisible;
        const barsDragged = Math.round(deltaX / barWidth);
        const shift = -barsDragged;

        let newStart = dragStartStartIndex + shift;
        let newEnd = dragStartEndIndex + shift;

        const totalLength = activeStock.liveCloses.length;
        if (newStart < 0) {
          newStart = 0;
          newEnd = totalVisible;
        }
        if (newEnd > totalLength) {
          newEnd = totalLength;
          newStart = totalLength - totalVisible;
        }

        if (newStart !== state.chartStartIndex || newEnd !== state.chartEndIndex) {
          state.chartStartIndex = newStart;
          state.chartEndIndex = newEnd;

          const historyCloses = activeStock.liveCloses.slice(state.chartStartIndex, state.chartEndIndex);
          const labels = activeStock.liveLabels.slice(state.chartStartIndex, state.chartEndIndex);
          const rawValues = activeStock.liveRawValues.slice(state.chartStartIndex, state.chartEndIndex);

          mainChart.data.labels = labels;
          if (state.chartType === 'candle') {
            mainChart.data.datasets[0].data = rawValues.map(v => [
              Math.min(parseFloat(v.open), parseFloat(v.close)),
              Math.max(parseFloat(v.open), parseFloat(v.close))
            ]);
            mainChart.data.datasets[0].backgroundColor = rawValues.map(v => parseFloat(v.close) >= parseFloat(v.open) ? 'rgba(0, 230, 118, 0.75)' : 'rgba(255, 23, 68, 0.75)');
            mainChart.data.datasets[0].borderColor = rawValues.map(v => parseFloat(v.close) >= parseFloat(v.open) ? '#00e676' : '#ff1744');
          } else {
            mainChart.data.datasets[0].data = historyCloses;
          }

          let minVal, maxVal;
          if (state.chartType === 'candle') {
            minVal = Math.min(...rawValues.map(v => parseFloat(v.low)));
            maxVal = Math.max(...rawValues.map(v => parseFloat(v.high)));
          } else {
            minVal = Math.min(...historyCloses);
            maxVal = Math.max(...historyCloses);
          }
          const verticalSpread = maxVal - minVal;
          const marginPadding = verticalSpread * 0.2 || minVal * 0.03;
          mainChart.scales.y.options.min = Math.max(0, parseFloat((minVal - marginPadding).toFixed(2)));
          mainChart.scales.y.options.max = parseFloat((maxVal + marginPadding).toFixed(2));

          mainChart.update('none');
        }
      }
    };

    const handleMouseUpOrLeave = (e) => {
      if (!isMouseDown) return;
      isMouseDown = false;

      // If did not drag, trigger add support/resistance level
      if (!hasDragged && mainChart && state.showLevels) {
        const rect = canvas.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const yValue = mainChart.scales.y.getValueForPixel(clickY);

        if (yValue !== undefined && yValue >= mainChart.scales.y.min && yValue <= mainChart.scales.y.max) {
          const clickedPrice = parseFloat(yValue.toFixed(2));
          const existingLines = state.linesMap[state.activeTicker] || [];
          const isDuplicate = existingLines.some(price => Math.abs(price - clickedPrice) < (activeStock.price * 0.003));

          if (!isDuplicate) {
            existingLines.push(clickedPrice);
            state.linesMap[state.activeTicker] = existingLines;
            saveSupportResistanceLines();
            updateDashboard();
          }
        }
      }
    };

    canvas.onmouseup = handleMouseUpOrLeave;
    canvas.onmouseleave = (e) => {
      state.hoverPrice = null;
      if (mainChart) mainChart.draw();
      handleMouseUpOrLeave(e);
    };

    // Scroll Wheel Zoom centered on cursor
    canvas.onwheel = (e) => {
      e.preventDefault();
      if (!mainChart) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const chartArea = mainChart.chartArea;
      if (mouseX < chartArea.left || mouseX > chartArea.right) return;

      const totalLength = activeStock.liveCloses.length;
      const currentVisible = state.chartEndIndex - state.chartStartIndex;

      const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1; // Scroll up = zoom in, scroll down = zoom out
      let newVisible = Math.round(currentVisible * zoomFactor);
      newVisible = Math.max(5, Math.min(totalLength, newVisible));

      if (newVisible === currentVisible) return;

      const localIndex = mainChart.scales.x.getValueForPixel(mouseX);
      let hoverIndex = state.chartStartIndex + Math.round(localIndex);
      if (isNaN(hoverIndex) || hoverIndex < 0 || hoverIndex >= totalLength) {
        hoverIndex = Math.round((state.chartStartIndex + state.chartEndIndex) / 2);
      }

      const ratio = (hoverIndex - state.chartStartIndex) / currentVisible;
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

      state.chartStartIndex = newStart;
      state.chartEndIndex = newEnd;

      const percentage = Math.round((newVisible / totalLength) * 100);
      state.zoomLevel = percentage;
      const zoomSlider = document.getElementById('zoomSlider');
      const zoomLabel = document.getElementById('zoomLabel');
      if (zoomSlider) zoomSlider.value = percentage;
      if (zoomLabel) zoomLabel.innerText = `${percentage}%`;

      const historyCloses = activeStock.liveCloses.slice(state.chartStartIndex, state.chartEndIndex);
      const labels = activeStock.liveLabels.slice(state.chartStartIndex, state.chartEndIndex);
      const rawValues = activeStock.liveRawValues.slice(state.chartStartIndex, state.chartEndIndex);

      mainChart.data.labels = labels;
      if (state.chartType === 'candle') {
        mainChart.data.datasets[0].data = rawValues.map(v => [
          Math.min(parseFloat(v.open), parseFloat(v.close)),
          Math.max(parseFloat(v.open), parseFloat(v.close))
        ]);
        mainChart.data.datasets[0].backgroundColor = rawValues.map(v => parseFloat(v.close) >= parseFloat(v.open) ? 'rgba(0, 230, 118, 0.75)' : 'rgba(255, 23, 68, 0.75)');
        mainChart.data.datasets[0].borderColor = rawValues.map(v => parseFloat(v.close) >= parseFloat(v.open) ? '#00e676' : '#ff1744');
      } else {
        mainChart.data.datasets[0].data = historyCloses;
      }

      let minVal, maxVal;
      if (state.chartType === 'candle') {
        minVal = Math.min(...rawValues.map(v => parseFloat(v.low)));
        maxVal = Math.max(...rawValues.map(v => parseFloat(v.high)));
      } else {
        minVal = Math.min(...historyCloses);
        maxVal = Math.max(...historyCloses);
      }
      const verticalSpread = maxVal - minVal;
      const marginPadding = verticalSpread * 0.2 || minVal * 0.03;
      mainChart.scales.y.options.min = Math.max(0, parseFloat((minVal - marginPadding).toFixed(2)));
      mainChart.scales.y.options.max = parseFloat((maxVal + marginPadding).toFixed(2));

      mainChart.update('none');
    };

    // Touch events for mobile dragging
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      isMouseDown = true;
      dragStartX = e.touches[0].clientX;
      dragStartStartIndex = state.chartStartIndex;
      dragStartEndIndex = state.chartEndIndex;
      hasDragged = false;
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (!isMouseDown || e.touches.length !== 1) return;
      const clientX = e.touches[0].clientX;
      const deltaX = clientX - dragStartX;
      if (Math.abs(deltaX) > 5) {
        hasDragged = true;
      }

      if (hasDragged && mainChart) {
        const chartArea = mainChart.chartArea;
        const totalVisible = dragStartEndIndex - dragStartStartIndex;
        const barWidth = chartArea.width / totalVisible;
        const barsDragged = Math.round(deltaX / barWidth);
        const shift = -barsDragged;

        let newStart = dragStartStartIndex + shift;
        let newEnd = dragStartEndIndex + shift;

        const totalLength = activeStock.liveCloses.length;
        if (newStart < 0) {
          newStart = 0;
          newEnd = totalVisible;
        }
        if (newEnd > totalLength) {
          newEnd = totalLength;
          newStart = totalLength - totalVisible;
        }

        if (newStart !== state.chartStartIndex || newEnd !== state.chartEndIndex) {
          state.chartStartIndex = newStart;
          state.chartEndIndex = newEnd;

          const historyCloses = activeStock.liveCloses.slice(state.chartStartIndex, state.chartEndIndex);
          const labels = activeStock.liveLabels.slice(state.chartStartIndex, state.chartEndIndex);
          const rawValues = activeStock.liveRawValues.slice(state.chartStartIndex, state.chartEndIndex);

          mainChart.data.labels = labels;
          if (state.chartType === 'candle') {
            mainChart.data.datasets[0].data = rawValues.map(v => [
              Math.min(parseFloat(v.open), parseFloat(v.close)),
              Math.max(parseFloat(v.open), parseFloat(v.close))
            ]);
          } else {
            mainChart.data.datasets[0].data = historyCloses;
          }

          let minVal, maxVal;
          if (state.chartType === 'candle') {
            minVal = Math.min(...rawValues.map(v => parseFloat(v.low)));
            maxVal = Math.max(...rawValues.map(v => parseFloat(v.high)));
          } else {
            minVal = Math.min(...historyCloses);
            maxVal = Math.max(...historyCloses);
          }
          const verticalSpread = maxVal - minVal;
          const marginPadding = verticalSpread * 0.2 || minVal * 0.03;
          mainChart.scales.y.options.min = Math.max(0, parseFloat((minVal - marginPadding).toFixed(2)));
          mainChart.scales.y.options.max = parseFloat((maxVal + marginPadding).toFixed(2));

          mainChart.update('none');
        }
      }
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
      isMouseDown = false;
    }, { passive: true });
  }, 20);
}

export function renderAllocationChart(holdingTickers, totalAssetValue) {
  const canvas = document.getElementById('portfolioAllocationChart');
  const container = document.getElementById('allocationChartContainer');
  const emptyMsg = document.getElementById('allocationEmptyMsg');

  if (!canvas || !container || !emptyMsg) return;

  if (holdingTickers.length === 0 || totalAssetValue === 0) {
    canvas.style.display = 'none';
    emptyMsg.style.display = 'block';
    if (portfolioAllocationChartInstance) {
      portfolioAllocationChartInstance.destroy();
      portfolioAllocationChartInstance = null;
    }
    return;
  }

  canvas.style.display = 'block';
  emptyMsg.style.display = 'none';

  const labels = [];
  const data = [];

  holdingTickers.forEach(ticker => {
    const holding = portfolioState.holdings[ticker];
    const metadata = state.stocks[ticker] || STOCKS_METADATA.find(s => s.ticker === ticker) || { price: holding.avgCost };
    const currentPrice = metadata.price || holding.avgCost;
    const marketValue = holding.shares * currentPrice;
    labels.push(ticker);
    data.push(parseFloat(marketValue.toFixed(2)));
  });

  const baseColors = [
    '#00f0ff', // Neon cyan
    '#8b5cf6', // Indigo violet
    '#10b981', // Emerald green
    '#f43f5e', // Rose red
    '#f59e0b', // Amber orange
    '#ec4899'  // Neon pink
  ];

  if (portfolioAllocationChartInstance) {
    portfolioAllocationChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  portfolioAllocationChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: baseColors.slice(0, labels.length),
        borderColor: 'rgba(2, 4, 10, 0.85)', // Deep dark border matching background
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // Muted legend, progress bars are used instead!
        },
        tooltip: {
          backgroundColor: '#060912',
          titleColor: '#00e5ff',
          bodyColor: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.06)',
          borderWidth: 1,
          titleFont: { family: 'Outfit', weight: '700', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          padding: 8,
          cornerRadius: 6,
          displayColors: false,
          callbacks: {
            label: function (context) {
              const val = context.parsed;
              const pct = (val / totalAssetValue) * 100;
              return ` ${context.label}: $${val.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${pct.toFixed(1)}%)`;
            }
          }
        }
      },
      cutout: '70%' // modern slim donut cutout
    }
  });
}

export function renderPerformanceChart() {
  try {
    const canvas = document.getElementById('portfolioPerformanceChart');
    const container = document.getElementById('performanceChartContainer');
    const emptyMsg = document.getElementById('performanceEmptyMsg');

    if (!canvas || !container || !emptyMsg) return;

    const txs = [...portfolioState.transactions];
    const activeTickers = Object.keys(portfolioState.holdings).filter(t => portfolioState.holdings[t].shares > 0);

    if (activeTickers.length === 0) {
      canvas.style.visibility = 'hidden';
      canvas.style.opacity = 0;
      emptyMsg.style.display = 'block';
      if (portfolioPerformanceChartInstance) {
        portfolioPerformanceChartInstance.destroy();
        portfolioPerformanceChartInstance = null;
      }
      return;
    }

    canvas.style.visibility = 'visible';
    canvas.style.opacity = 1;
    emptyMsg.style.display = 'none';

    // Find the earliest BUY transaction across all transactions in the portfolio to mark inception
    let earliestActiveTimestamp = Infinity;
    txs.forEach(tx => {
      if (tx.type === 'BUY') {
        if (tx.timestamp < earliestActiveTimestamp) {
          earliestActiveTimestamp = tx.timestamp;
        }
      }
    });

    if (earliestActiveTimestamp === Infinity) {
      earliestActiveTimestamp = txs[0] ? txs[0].timestamp : Date.now();
    }

    // Determine startDate and endDate (Today is always the rightmost boundary!)
    const startDate = new Date(earliestActiveTimestamp);
    const endDate = new Date();

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    // If startDate is in the future relative to today, cap it at today
    if (startDate > endDate) {
      startDate.setTime(endDate.getTime());
    }

    // Calculate the difference in days
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Determine interval: daily step (diffDays <= 30) or weekly step (diffDays > 30)
    const stepDays = (diffDays <= 30) ? 1 : 7;
    const stepMs = stepDays * 24 * 60 * 60 * 1000;

    // Generate simulated timeline dates from startDate to endDate
    const timelineDates = [];
    let currentSimDate = new Date(startDate.getTime());
    while (currentSimDate <= endDate) {
      timelineDates.push(new Date(currentSimDate.getTime()));
      currentSimDate.setTime(currentSimDate.getTime() + stepMs);
    }

    // Ensure today (endDate) is always exactly the last date in the timeline
    if (timelineDates.length === 0 || timelineDates[timelineDates.length - 1].getTime() !== endDate.getTime()) {
      timelineDates.push(new Date(endDate.getTime()));
    }

    // Performance points array
    const points = [];

    // Helper to get historical closing price of a stock on a specific date from cache
    function getPriceOnDate(ticker, targetDate, fallbackPrice) {
      const stock = state.stocks[ticker];
      if (!stock) return fallbackPrice;

      // Use the dedicated long-term portfolioHistory if available
      const closes = stock.portfolioHistory || stock.liveCloses || [];
      const labels = stock.portfolioLabels || stock.liveLabels || [];

      if (closes.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const compareDate = new Date(targetDate.getTime());
        compareDate.setHours(0, 0, 0, 0);

        if (compareDate.getTime() === today.getTime()) {
          return parseFloat(stock.price) || parseFloat(closes[closes.length - 1]) || fallbackPrice;
        }

        // Try exact match in labels first
        if (labels.length === closes.length) {
          let exactIndex = -1;
          labels.forEach((label, idx) => {
            const labelDate = new Date(label);
            if (!isNaN(labelDate.getTime())) {
              labelDate.setHours(0, 0, 0, 0);
              if (labelDate.getTime() === compareDate.getTime()) {
                exactIndex = idx;
              }
            }
          });
          if (exactIndex !== -1) {
            return parseFloat(closes[exactIndex]) || fallbackPrice;
          }
        }

        // Fallback for mock walks and missing labels: map calendar offset days backwards from today
        const msDiff = today.getTime() - compareDate.getTime();
        const daysDiff = Math.max(0, Math.floor(msDiff / (24 * 60 * 60 * 1000)));

        // If we are using the weekly series ('1w'), each index is 7 calendar days apart!
        const isWeekly = (closes === stock.portfolioHistory) || (state.selectedInterval === '1w' && closes === stock.liveCloses);
        const indexDiff = isWeekly ? Math.floor(daysDiff / 7) : Math.floor(daysDiff * 5 / 7);
        const index = closes.length - 1 - indexDiff;

        if (index >= 0 && index < closes.length) {
          return parseFloat(closes[index]) || fallbackPrice;
        } else if (index < 0) {
          // If the date is older than our loaded history, return the oldest available historical price
          return parseFloat(closes[0]) || fallbackPrice;
        }
      }
      return fallbackPrice;
    }

    // For each date in the timeline, simulate holdings and calculate unrealized P&L
    timelineDates.forEach(D => {
      const holdingsOnDate = {};
      const lastPriceOnDate = {};

      txs.forEach(tx => {
        // Accumulate transactions that happened before or on this day
        if (tx.timestamp <= D.getTime() + 86399999) {
          const ticker = tx.ticker;
          const txPrice = parseFloat(tx.price) || 0;
          const txShares = parseFloat(tx.shares) || 0;
          const txFees = parseFloat(tx.fees) || 0;

          lastPriceOnDate[ticker] = txPrice;

          if (tx.type === 'BUY') {
            if (!holdingsOnDate[ticker]) {
              holdingsOnDate[ticker] = { shares: 0, avgCost: 0, totalFees: 0 };
            }
            const h = holdingsOnDate[ticker];
            const newPureTotalCost = (h.shares * h.avgCost) + (txShares * txPrice);
            h.shares += txShares;
            h.avgCost = h.shares > 0 ? (newPureTotalCost / h.shares) : 0;
            h.totalFees = (h.totalFees || 0) + txFees;
          } else {
            // SELL
            if (holdingsOnDate[ticker]) {
              const h = holdingsOnDate[ticker];
              const originalShares = h.shares;
              h.shares = Math.max(0, h.shares - txShares);
              
              if (originalShares > 0) {
                h.totalFees = h.shares * ((h.totalFees || 0) / originalShares);
              } else {
                h.totalFees = 0;
              }

              if (h.shares < 1e-9) {
                delete holdingsOnDate[ticker];
              }
            }
          }
        }
      });

      // Compute total unrealized profit on this simulation date
      let unrealizedPLOnDate = 0;
      Object.keys(holdingsOnDate).forEach(t => {
        const h = holdingsOnDate[t];
        if (h.shares > 0) {
          const price = getPriceOnDate(t, D, lastPriceOnDate[t] || h.avgCost || 0);
          const totalCostOnDate = (h.shares * h.avgCost) + (h.totalFees || 0);
          const marketValueOnDate = h.shares * price;
          unrealizedPLOnDate += marketValueOnDate - totalCostOnDate;
        }
      });

      points.push({
        x: D,
        y: unrealizedPLOnDate
      });
    });

    // Safeguard: if there is only one simulation date (today), add a yesterday baseline to display a clean line
    if (points.length === 1) {
      const prevDate = new Date(points[0].x.getTime() - 24 * 60 * 60 * 1000);
      points.unshift({
        x: prevDate,
        y: 0
      });
    }

    // Sort data points chronologically to be absolutely certain they display left-to-right
    points.sort((a, b) => a.x.getTime() - b.x.getTime());

    // Labels represent clean short date formatting (e.g. "May 28")
    const labels = points.map(p => {
      return p.x.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });
    const data = points.map(p => parseFloat(p.y.toFixed(2)) || 0);

    if (portfolioPerformanceChartInstance) {
      portfolioPerformanceChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Custom glowing line gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, 'rgba(0, 229, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(2, 4, 10, 0)');

    portfolioPerformanceChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Unrealized P&L',
          data: data,
          borderColor: '#00e5ff',
          borderWidth: 2,
          pointBackgroundColor: '#00e5ff',
          pointBorderColor: 'rgba(2, 4, 10, 0.85)',
          pointBorderWidth: 1.5,
          pointRadius: 0, // Invisible by default
          pointHoverRadius: 8, // Prominent hover dot
          pointHoverBackgroundColor: '#00e5ff',
          pointHoverBorderColor: '#fff', // White glow border on hover
          pointHoverBorderWidth: 2.5, // Thick hover border
          pointHitRadius: 10, // Easily trigger hover dot visibility
          fill: true,
          backgroundColor: gradient,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            right: 90
          }
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            display: true, // Show the date on the x-axis!
            grid: {
              display: false,
              drawBorder: false
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Plus Jakarta Sans', size: 9, weight: '500' },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 5
            }
          },
          y: {
            position: 'right',
            beginAtZero: true,
            grid: {
              color: function (context) {
                if (context.tick && context.tick.value === 0) {
                  return 'rgba(0, 229, 255, 0.35)'; // Cyan zero baseline
                }
                return 'rgba(255, 255, 255, 0.02)';
              },
              borderDash: function (context) {
                if (context.tick && context.tick.value === 0) {
                  return [5, 5]; // Dashed zero line
                }
                return [];
              },
              drawBorder: false
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'JetBrains Mono', size: 9, weight: '500' },
              callback: function (value) {
                if (value >= 0) {
                  return '+$' + value.toLocaleString();
                } else {
                  return '-$' + Math.abs(value).toLocaleString();
                }
              }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#060912',
            titleColor: '#00e5ff',
            bodyColor: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.06)',
            borderWidth: 1,
            titleFont: { family: 'Outfit', weight: '700', size: 11 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            padding: 8,
            cornerRadius: 6,
            displayColors: false,
            callbacks: {
              title: function (context) {
                const idx = context[0].dataIndex;
                const d = points[idx].x;
                return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
              },
              label: function (context) {
                const val = context.parsed.y;
                if (val >= 0) {
                  return ` Unrealized P&L: +$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                } else {
                  return ` Unrealized P&L: -$${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                }
              }
            }
          }
        }
      },
      plugins: [{
        id: 'zeroLinePlugin',
        afterDraw: (chart) => {
          const { ctx, scales: { y }, chartArea: { left, right, top, bottom } } = chart;
          if (!y) return;

          // 1. Draw Zero Baseline
          const zeroY = y.getPixelForValue(0);
          if (zeroY >= top && zeroY <= bottom) {
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)'; // Cyan zero baseline
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(left, zeroY);
            ctx.lineTo(right, zeroY);
            ctx.stroke();
            ctx.restore();
          }

          // 2. Draw Current P&L Level (Reference line and right-side Tag)
          const dataset = chart.data.datasets[0];
          if (dataset && dataset.data && dataset.data.length > 0) {
            const currentPL = dataset.data[dataset.data.length - 1];
            const currentPLY = y.getPixelForValue(currentPL);

            if (currentPLY >= top && currentPLY <= bottom) {
              ctx.save();

              // Draw reference dashed line
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.moveTo(left, currentPLY);
              ctx.lineTo(right, currentPLY);
              ctx.stroke();

              // Draw tag box on the right Y-axis price scale
              const isGain = currentPL >= 0;
              ctx.fillStyle = isGain ? 'rgba(16, 185, 129, 0.9)' : 'rgba(244, 63, 94, 0.9)'; // Green or red background
              ctx.beginPath();
              ctx.roundRect(right + 5, currentPLY - 10, 80, 20, 4);
              ctx.fill();

              // Draw text inside tag
              ctx.fillStyle = '#ffffff';
              ctx.font = '700 9px var(--font-display)';
              const formattedPL = `${isGain ? '+' : '-'}$${Math.abs(currentPL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              ctx.fillText(`NOW: ${formattedPL}`, right + 10, currentPLY + 4);

              ctx.restore();
            }
          }
        }
      }]
    });
  } catch (error) {
    console.error("Error drawing unrealized performance chart:", error);
  }
}
