import { describe, expect, test } from "vitest";

import { getVerifyClaimTemplate } from "../tools/templates/core/templates.js";

describe("verify-claim template", () => {
  test("asks for fresh evidence and frames validation as a structured repair loop", () => {
    const template = getVerifyClaimTemplate();

    expect(template.content).toContain("fresh verification evidence");
    expect(template.content).toContain("optional auto-retry wrapper");
  });
});
