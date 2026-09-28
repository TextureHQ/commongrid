import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

type PullRequest = {
  number: number;
  state: string;
  base?: { repo?: { full_name?: string } };
  head?: { repo?: { full_name?: string }; sha?: string };
};

const {
  isVercelDeploymentStatus,
  mirrorBranchName,
  selectExternalPullRequest,
}: {
  isVercelDeploymentStatus: (payload: Record<string, unknown>) => boolean;
  mirrorBranchName: (pullNumber: number) => string;
  selectExternalPullRequest: (pulls: PullRequest[], repository: string, sha: string) => PullRequest | null;
} = require("../.github/scripts/approved-fork-preview.cjs");

const SHA = "d966556ea0d4e6e80d81fd6a489e6a5e1be2f26b";

describe("approved fork previews", () => {
  it("recognizes the pending deployment status Vercel emits after approval", () => {
    expect(
      isVercelDeploymentStatus({
        context: "Vercel",
        state: "pending",
        target_url: "https://vercel.com/texture/commongrid/3M6eGR5WX3zi4nXWoV12neu19a4q",
      })
    ).toBe(true);
  });

  it("rejects the pre-approval authorization status", () => {
    expect(
      isVercelDeploymentStatus({
        context: "Vercel",
        state: "failure",
        target_url: "https://vercel.com/git/authorize?team=Texture&slug=texture",
      })
    ).toBe(false);
  });

  it("rejects unrelated Vercel projects and status contexts", () => {
    expect(
      isVercelDeploymentStatus({
        context: "Vercel",
        state: "pending",
        target_url: "https://vercel.com/texture/www/3M6eGR5WX3zi4nXWoV12neu19a4q",
      })
    ).toBe(false);
    expect(
      isVercelDeploymentStatus({
        context: "not-vercel",
        state: "pending",
        target_url: "https://vercel.com/texture/commongrid/3M6eGR5WX3zi4nXWoV12neu19a4q",
      })
    ).toBe(false);
  });

  it("selects only an open external PR at the exact approved SHA", () => {
    const pull = {
      number: 512,
      state: "open",
      base: { repo: { full_name: "TextureHQ/commongrid" } },
      head: { repo: { full_name: "internetblake/commongrid" }, sha: SHA },
    };
    const internalPull = {
      number: 514,
      state: "open",
      base: { repo: { full_name: "TextureHQ/commongrid" } },
      head: { repo: { full_name: "TextureHQ/commongrid" }, sha: SHA },
    };

    expect(selectExternalPullRequest([internalPull, pull], "TextureHQ/commongrid", SHA)).toBe(pull);
    expect(selectExternalPullRequest([pull], "TextureHQ/commongrid", "a".repeat(40))).toBeNull();
  });

  it("uses one deterministic mirror branch per PR", () => {
    expect(mirrorBranchName(512)).toBe("vercel-preview-pr-512");
    expect(() => mirrorBranchName(0)).toThrow("Invalid pull request number");
  });
});
