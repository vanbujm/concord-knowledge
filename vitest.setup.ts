import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount anything rendered in a test before the next one runs. Testing Library
// only auto-registers this when Vitest globals are enabled, which they are not
// here, so we register it explicitly.
afterEach(() => {
  cleanup();
});
