import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { designTokens } from "@serviceflow/shared";
import { describe, expect, it } from "vitest";

// The Tailwind theme in index.css must mirror the shared design tokens that
// the mobile app also uses — this fails if either side drifts.
const css = readFileSync(resolve(__dirname, "index.css"), "utf8");

describe("web theme mirrors shared design tokens", () => {
  it.each(Object.entries(designTokens.colors.brand))("brand-%s", (shade, hex) => {
    expect(css).toContain(`--color-brand-${shade}: ${hex};`);
  });

  it.each(Object.entries(designTokens.colors.accent))("accent-%s", (shade, hex) => {
    expect(css).toContain(`--color-accent-${shade}: ${hex};`);
  });

  it("danger colour", () => {
    expect(css).toContain(`--color-danger: ${designTokens.colors.danger};`);
  });
});
