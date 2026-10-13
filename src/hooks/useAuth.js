import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { migrateLegacyStorage } from '../utils/accountStorage.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const receiveSession = session => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      if (nextUser) migrateLegacyStorage(nextUser.id);
      setUser(nextUser);
      setLoading(false);
    };
    // Register first, so a newer sign-in cannot be overwritten by an older session read.
    let authEventReceived = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      receiveSession(session);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.warn('Could not restore session:', error);
      if (!authEventReceived) receiveSession(data?.session);
    }).catch(error => {
      console.warn('Could not restore session:', error);
      if (!authEventReceived) receiveSession(null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const signUp = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signInWithGitHub = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return {
    user,
    loading,
    signUp,
    signIn,
    signInWithGitHub,
    signInWithGoogle,
    signOut
  };
}
