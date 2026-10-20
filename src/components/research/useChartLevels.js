import { useEffect, useMemo, useRef, useState } from 'react';
import { validLevels, visibleLevels } from './chartLevels.js';

export default function useChartLevels({ activeTicker, currentPrice, linesMap, setLinesMap, showLevels, setShowLevels }) {
  const [detail, setDetail] = useState('key');
  const [context, setContext] = useState({ ticker: activeTicker, drawing: false, selected: null, message: '' });
  const addButtonRef = useRef(null);
  // Reset transient interaction state before a different symbol is displayed.
  if (context.ticker !== activeTicker) {
    setContext({ ticker: activeTicker, drawing: false, selected: null, message: '' });
  }
  const mode = showLevels ? detail : 'off';
  const drawing = context.ticker === activeTicker && context.drawing && showLevels;
  const savedLevels = linesMap[activeTicker];
  const levels = useMemo(() => validLevels(savedLevels || []), [savedLevels]);
  const selected = levels.includes(context.selected) ? context.selected : null;
  const shown = useMemo(() => visibleLevels(levels, currentPrice, mode, selected), [levels, currentPrice, mode, selected]);

  const cancelDrawing = () => {
    setContext(previous => ({ ...previous, drawing: false, message: 'Adding a level cancelled.' }));
    addButtonRef.current?.focus();
  };
  useEffect(() => {
    if (!drawing) return;
    const handleKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setContext(previous => ({ ...previous, drawing: false, message: 'Adding a level cancelled.' }));
        addButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [drawing]);

  const setMode = nextMode => {
    setShowLevels(nextMode !== 'off');
    if (nextMode !== 'off') setDetail(nextMode);
    setContext(previous => ({ ...previous, drawing: false, message: '' }));
  };
  const startDrawing = () => {
    setShowLevels(true);
    setContext({ ticker: activeTicker, drawing: true, selected, message: 'Tap or click a price on the chart. Press Escape to cancel.' });
  };
  const addLevel = value => {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) return false;
    const rounded = Number(price.toFixed(2));
    if (rounded <= 0) return false;
    // Preserve the existing nearby-level threshold used by the chart editor.
    const duplicate = levels.some(existing => existing === rounded || Math.abs(existing - rounded) < currentPrice * .003);
    if (duplicate) {
      setContext(previous => ({ ...previous, message: 'A level already exists near that price. Choose another price.' }));
      return false;
    }
    setLinesMap(previous => ({ ...previous, [activeTicker]: [...(previous[activeTicker] || []), rounded] }));
    setShowLevels(true);
    setContext({ ticker: activeTicker, drawing: false, selected: rounded, message: 'Price level added.' });
    return true;
  };
  const handleChartPrice = value => {
    if (!drawing) return;
    if (addLevel(value)) addButtonRef.current?.focus();
  };
  const selectLevel = price => {
    setShowLevels(true);
    setContext({ ticker: activeTicker, drawing: false, selected: price, message: 'Price level selected on chart.' });
  };
  const removeLevel = price => {
    setLinesMap(previous => ({ ...previous, [activeTicker]: (previous[activeTicker] || []).filter(value => value !== price) }));
    setContext(previous => ({ ...previous, selected: previous.selected === price ? null : previous.selected, message: 'Price level removed.' }));
  };
  return { mode, setMode, drawing, startDrawing, cancelDrawing, handleChartPrice, addLevel, selected,
    selectLevel, removeLevel, levels, shown, message: context.message, bindAddButton: node => { addButtonRef.current = node; }, focusAddButton: () => addButtonRef.current?.focus() };
}
