import { Component, type ReactNode } from 'react';

/**
 * Last line of defence: show what went wrong instead of an empty page. Text is in both
 * languages because the translation context may be the thing that failed.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>কিছু একটা সমস্যা হয়েছে · Something went wrong</h1>
        <p>পেজটি আবার লোড করুন। আপনার এডিট করা সাবটাইটেল এই ডিভাইসে সেভ করা আছে।</p>
        <p>Please reload. Your edited subtitles are saved on this device.</p>
        <pre>{error.message}</pre>
        <button className="btn primary" onClick={() => location.reload()}>
          Reload / আবার লোড করুন
        </button>
      </div>
    );
  }
}
