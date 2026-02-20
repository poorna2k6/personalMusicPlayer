import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

const FEATURES_GUEST = [
  { icon: '🎵', label: 'Browse & play your entire music library' },
  { icon: '💿', label: 'Explore albums and artists' },
  { icon: '🎧', label: 'Create and manage playlists' },
  { icon: '🔀', label: 'Shuffle and Party DJ mode' },
  { icon: '🎛️', label: 'Full keyboard & playback controls' },
];

const FEATURES_SIGNED_IN = [
  { icon: '📜', label: 'Play history saved across sessions' },
  { icon: '🎯', label: 'Personalized song recommendations' },
  { icon: '📊', label: 'Listening stats based on your taste' },
  { icon: '🔄', label: 'Smart DJ that learns what you love' },
  { icon: '☁️', label: 'Account synced to your Google profile' },
];

export default function AuthScreen() {
  const { login, skip } = useAuth();
  const [showSkipInfo, setShowSkipInfo] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Authentication failed');
      }
      const data = await res.json();
      login(data.user, data.token);
    } catch (err) {
      setError(err.message || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showSkipInfo) {
    return (
      <SkipInfoScreen
        onContinue={skip}
        onBack={() => setShowSkipInfo(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-xl">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-indigo-400 tracking-tight">Raagam</h1>
          <p className="text-surface-400 mt-2 text-sm">Your personal music player</p>
        </div>

        {/* Card */}
        <div className="bg-surface-900 rounded-2xl border border-surface-800 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-1">Welcome</h2>
          <p className="text-surface-400 text-sm mb-7">
            Sign in to unlock history tracking and personalized recommendations.
          </p>

          {/* Google Sign-In */}
          <div className="flex justify-center mb-4 min-h-[44px]">
            {loading ? (
              <div className="flex items-center gap-2 text-surface-400 text-sm py-2.5">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Signing in…
              </div>
            ) : (
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Sign in failed. Please try again.')}
                theme="filled_black"
                shape="rectangular"
                size="large"
                text="signin_with_google"
                width="320"
              />
            )}
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center mb-3">{error}</p>
          )}

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-700" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-surface-900 text-surface-500 text-xs uppercase tracking-wider">or</span>
            </div>
          </div>

          {/* Skip button */}
          <button
            onClick={() => setShowSkipInfo(true)}
            className="w-full py-2.5 rounded-xl border border-surface-600 text-surface-300 hover:text-white hover:border-surface-500 hover:bg-surface-800 text-sm font-medium transition-colors"
          >
            Skip for now
          </button>
        </div>

        <p className="text-surface-600 text-xs text-center mt-5">
          Signing in enables history, recommendations, and more
        </p>
      </div>
    </div>
  );
}

function SkipInfoScreen({ onContinue, onBack }) {
  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">Continue as Guest?</h1>
          <p className="text-surface-400 text-sm mt-1">Here's what you'll get — and what you'll miss</p>
        </div>

        {/* Warning banner */}
        <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl p-4 mb-6 flex gap-3 items-start">
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-amber-300 font-medium text-sm">History &amp; recommendations unavailable</p>
            <p className="text-amber-400/80 text-xs mt-0.5">
              Without signing in, your play history won't be saved and you won't receive personalized song recommendations. These features require a Google account.
            </p>
          </div>
        </div>

        {/* Feature comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Guest features */}
          <div className="bg-surface-900 rounded-xl border border-surface-800 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-surface-500" />
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Available as Guest</h3>
            </div>
            <ul className="space-y-2.5">
              {FEATURES_GUEST.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-surface-300">
                  <span className="text-base leading-snug shrink-0">{f.icon}</span>
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Signed-in features */}
          <div className="bg-surface-900 rounded-xl border border-indigo-800/60 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">With Google Login</h3>
            </div>
            <ul className="space-y-2.5">
              {FEATURES_SIGNED_IN.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-surface-300">
                  <span className="text-base leading-snug shrink-0">{f.icon}</span>
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-2.5 rounded-xl border border-surface-600 text-surface-300 hover:text-white hover:border-surface-500 hover:bg-surface-800 text-sm font-medium transition-colors"
          >
            Back to sign in
          </button>
          <button
            onClick={onContinue}
            className="flex-1 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
          >
            Continue as Guest
          </button>
        </div>

        <p className="text-surface-600 text-xs text-center mt-4">
          You can sign in anytime from the menu in the top bar
        </p>
      </div>
    </div>
  );
}
