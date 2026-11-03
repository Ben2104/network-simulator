import { Component, type ReactNode } from 'react';

/** Catches a WebGL or scene crash and hands control back to the 2D view instead of a blank page. */
export class SceneBoundary extends Component<
  { onError: (message: string) => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
