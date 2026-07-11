import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("px-2", "font-medium")).toBe("px-2 font-medium");
  });

  it("drops falsy values", () => {
    expect(cn("px-2", false, undefined, "font-medium")).toBe(
      "px-2 font-medium",
    );
  });

  it("lets a later tailwind class win over an earlier conflicting one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
