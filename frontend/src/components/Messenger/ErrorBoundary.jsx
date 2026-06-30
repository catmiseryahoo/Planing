import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: 'rgba(255, 0, 0, 0.1)', color: 'white', position: 'fixed', top: 80, right: 20, zIndex: 9999, borderRadius: '8px', border: '1px solid red' }}>
          <h2>Ошибка в мессенджере</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{this.state.error?.toString()}</pre>
          <button onClick={() => this.setState({ hasError: false })} style={{ marginTop: 10, padding: '4px 8px' }}>Повторить</button>
        </div>
      );
    }
    return this.props.children;
  }
}
