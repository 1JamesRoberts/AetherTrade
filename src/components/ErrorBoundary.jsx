import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught a component error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '30px',
          margin: '20px',
          background: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid #F43F5E',
          borderRadius: '12px',
          color: '#ffffff',
          fontFamily: "'JetBrains Mono', monospace"
        }}>
          <h2 style={{ color: '#F43F5E', margin: '0 0 12px 0', fontSize: '18px' }}>
            <i className="fa-solid fa-triangle-exclamation"></i> Rendering Error in {this.props.name || 'Component'}
          </h2>
          <p style={{ margin: '0 0 16px 0', color: '#CBD5E1', fontSize: '14px' }}>
            {this.state.error && this.state.error.toString()}
          </p>
          <pre style={{
            background: 'rgba(0, 0, 0, 0.5)',
            padding: '16px',
            borderRadius: '8px',
            overflowX: 'auto',
            fontSize: '11px',
            color: '#94A3B8'
          }}>
            {this.state.errorInfo?.componentStack || this.state.error?.stack}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#06B6D4',
              border: 'none',
              borderRadius: '6px',
              color: '#000',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Retry Rendering
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
