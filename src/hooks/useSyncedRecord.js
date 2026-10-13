import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isCloudEnabled } from '../lib/supabase.js';
import { assertResult } from '../lib/portfolioService.js';
import { accountKey, readStored, writeStored } from '../utils/accountStorage.js';

/** Cloud hydration and incoming events never write back to the cloud. */
export function useSyncedRecord(user, table, field, key, fallback, addToast) {
  const userId = user.id;
  const storageKey = accountKey(key, userId);
  const [value, setValue] = useState(() => readStored(storageKey, fallback));
  const valueRef = useRef(value);
  const readyRef = useRef(!isCloudEnabled);
  const aliveRef = useRef(false);
  const requestRef = useRef(0);
  const pendingRef = useRef(0);
  const queueRef = useRef(Promise.resolve());

  const receive = useCallback(next => {
    valueRef.current = next;
    writeStored(storageKey, next);
    setValue(next);
  }, [storageKey]);

  const load = useCallback(async () => {
    if (!aliveRef.current || pendingRef.current || !isCloudEnabled) return;
    const request = ++requestRef.current;
    try {
      const data = assertResult(await supabase.from(table).select(field).eq('user_id', userId).maybeSingle());
      if (!aliveRef.current || request !== requestRef.current || pendingRef.current) return;
      if (data) {
        const next = data[field];
        if (next === null || typeof next !== 'object' || (field === 'tickers' && !Array.isArray(next))) throw new Error('Invalid saved data.');
        receive(next); // Empty arrays and maps are valid saved values.
      }
      readyRef.current = true;
    } catch (error) {
      if (aliveRef.current && request === requestRef.current) addToast(`Could not load ${table}; saved data was kept. ${error.message}`, 'error');
    }
  }, [table, field, userId, receive, addToast]);

  useEffect(() => {
    aliveRef.current = true;
    const requests = requestRef;
    if (isCloudEnabled) void Promise.resolve().then(load);
    const channel = isCloudEnabled ? supabase.channel(`${table}_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, () => { void load(); })
      .subscribe(status => { if (status === 'SUBSCRIBED') void load(); }) : null;
    const onStorage = event => {
      if (event.key === storageKey && event.newValue && !pendingRef.current) receive(readStored(storageKey, fallback));
    };
    const onOnline = () => { void load(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('online', onOnline);
    return () => {
      aliveRef.current = false;
      ++requests.current;
      if (channel) void supabase.removeChannel(channel);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('online', onOnline);
    };
  }, [table, userId, storageKey, fallback, receive, load]);

  const update = useCallback(updater => {
    if (!readyRef.current) {
      addToast('Wait for cloud sync or refresh to retry before saving.', 'error');
      return Promise.resolve(false);
    }
    ++pendingRef.current;
    ++requestRef.current;
    const task = queueRef.current.then(async () => {
      try {
        if (!aliveRef.current) return false;
        if (!readyRef.current) throw new Error('Wait for cloud sync or refresh to retry before saving.');
        const next = typeof updater === 'function' ? updater(valueRef.current) : updater;
        if (isCloudEnabled) assertResult(await supabase.from(table).upsert({ user_id: userId,
          [field]: next, updated_at: new Date().toISOString() }));
        if (!aliveRef.current) return false;
        receive(next);
        return true;
      } catch (error) {
        if (aliveRef.current) addToast(`Could not save ${table}. ${error.message}`, 'error');
        return false;
      } finally {
        --pendingRef.current;
        if (!pendingRef.current && aliveRef.current) void load();
      }
    });
    queueRef.current = task;
    return task;
  }, [table, field, userId, receive, addToast, load]);
  return [value, update];
}
