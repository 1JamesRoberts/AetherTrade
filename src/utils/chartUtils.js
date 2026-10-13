/** Missing volume is a gap; a reported zero remains a real zero. */
export function calculateVolumeData(data, rawValues) {
  if (!data?.length) return [];
  return data.map((item, index) => {
    const raw = Object.hasOwn(item, 'volume') ? item.volume : rawValues[index]?.volume;
    const volume = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(volume) || volume < 0) return { time: item.time };
    return { time: item.time, value: volume,
      color: item.close >= item.open ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)' };
  });
}
