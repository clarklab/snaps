/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// View Transitions API — not yet in React's built-in CSSProperties.
import "react";
declare module "react" {
  interface CSSProperties {
    viewTransitionName?: string;
  }
}
