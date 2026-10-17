import { isCloudEnabled } from '../lib/supabase.js';
import { useState } from 'react';
import { AppearancePicker } from './layout/WorkspaceShell';

export default function AuthPage({ onSignUp, onSignIn, onGitHub, onGoogle }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await onSignUp(email, password);
        setError('');
        if (isCloudEnabled) alert('Check your email for a confirmation link!');
      } else {
        await onSignIn(email, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGitHub = async () => {
    setError('');
    try { await onGitHub(); } catch (err) { setError(err.message); }
  };

  const handleGoogle = async () => {
    setError('');
    try { await onGoogle(); } catch (err) { setError(err.message); }
  };

  return (
    <div className="auth-page">
      <div className="auth-appearance"><AppearancePicker /></div>
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon"><i className="fa-solid fa-chart-line"></i></div>
          <div className="logo-text">
            <span className="logo-brand">AETHER</span>
            <span className="logo-sub">TRADE</span>
          </div>
        </div>

        <h2 className="auth-title">{!isCloudEnabled ? 'Open Local Workspace' : isSignUp ? 'Create Account' : 'Sign In'}</h2>
        {!isCloudEnabled && <p className="auth-toggle">Your data stays in this browser. Email selects a workspace; this mode does not authenticate an account.</p>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="workspace-email">Email</label>
            <input
              id="workspace-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          {isCloudEnabled && <div className="auth-field">
            <label htmlFor="workspace-password">Password</label>
            <input
              id="workspace-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              minLength={6}
            />
          </div>}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Please wait...' : !isCloudEnabled ? 'Continue on This Device' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {isCloudEnabled && <>
        <div className="auth-divider">
          <span>or continue with</span>
        </div>

        <div className="auth-providers">
          <button className="auth-provider-btn" onClick={handleGitHub}>
            <i className="fa-brands fa-github"></i> GitHub
          </button>
          <button className="auth-provider-btn" onClick={handleGoogle}>
            <i className="fa-brands fa-google"></i> Google
          </button>
        </div>

        <p className="auth-toggle">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
        </>}
      </div>
    </div>
  );
}
