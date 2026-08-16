import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'rgba(13, 19, 33, 0.9)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: '12px',
          color: '#ffffff',
          textAlign: 'center',
          height: '100%',
          minHeight: '200px'
        }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '24px', color: '#F43F5E', marginBottom: '12px' }}></i>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Terminal Component Recovery</h3>
          <p style={{ fontSize: '12px', color: '#94A3B8', maxWidth: '300px', marginBottom: '16px' }}>
            A temporary display error occurred. Click below to reload this panel.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              background: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              color: '#06B6D4',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px'
            }}
          >
            <i className="fa-solid fa-rotate-right" style={{ marginRight: '6px' }}></i>
            Reload Panel
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
