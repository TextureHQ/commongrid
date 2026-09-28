import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);

type PullRequest = {
  number: number;
  state: string;
  base?: { repo?: { full_name?: string } };
  head?: { repo?: { full_name?: string }; sha?: string };
};

const {
  isVercelDeploymentStatus,
  mirrorApprovedFork,
  mirrorBranchName,
  mirrorCommitMessage,
  parseMirrorCommit,
  propagateMirrorStatus,
  selectExternalPullRequest,
}: {
  isVercelDeploymentStatus: (payload: Record<string, unknown>) => boolean;
  mirrorApprovedFork: (args: Record<string, unknown>) => Promise<void>;
  mirrorBranchName: (pullNumber: number) => string;
  mirrorCommitMessage: (pullNumber: number, sourceSha: string) => string;
  parseMirrorCommit: (commit: Record<string, unknown>) => { pullNumber: number; sourceSha: string } | null;
  propagateMirrorStatus: (args: Record<string, unknown>) => Promise<boolean>;
  selectExternalPullRequest: (pulls: PullRequest[], repository: string, sha: string) => PullRequest | null;
} = require("../.github/scripts/approved-fork-preview.cjs");

const SHA = "d966556ea0d4e6e80d81fd6a489e6a5e1be2f26b";
const MIRROR_SHA = "200affbec2f487def8dfbc97aaab9b80054662c7";
const TREE_SHA = "afe405764413b40800d3dbcac4e63b7cd8f835e6";
const TARGET_URL = "https://vercel.com/texture/commongrid/zyi3umBQJWMZuUUMoPtQ23gUTYpc";

const pull = {
  number: 512,
  state: "open",
  base: { repo: { full_name: "TextureHQ/commongrid" } },
  head: { repo: { full_name: "internetblake/commongrid" }, sha: SHA },
};

function createCore() {
  const summary = {
    addHeading: vi.fn(),
    addRaw: vi.fn(),
    addTable: vi.fn(),
    write: vi.fn().mockResolvedValue(undefined),
  };
  summary.addHeading.mockReturnValue(summary);
  summary.addRaw.mockReturnValue(summary);
  summary.addTable.mockReturnValue(summary);

  return { info: vi.fn(), summary };
}

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

  it("creates a distinct trusted commit with the reviewed SHA as its parent", async () => {
    const getCommit = vi.fn().mockResolvedValue({
      data: { message: "source commit", parents: [], tree: { sha: TREE_SHA } },
    });
    const github = {
      rest: {
        git: {
          getCommit,
          getRef: vi.fn().mockRejectedValue({ status: 404 }),
          createCommit: vi.fn().mockResolvedValue({ data: { sha: MIRROR_SHA } }),
          createRef: vi.fn().mockResolvedValue({}),
          updateRef: vi.fn(),
        },
        repos: {
          listPullRequestsAssociatedWithCommit: vi.fn().mockResolvedValue({ data: [pull] }),
          createCommitStatus: vi.fn(),
        },
        pulls: { get: vi.fn() },
      },
    };
    const core = createCore();

    await mirrorApprovedFork({
      github,
      core,
      context: {
        repo: { owner: "TextureHQ", repo: "commongrid" },
        payload: { context: "Vercel", state: "pending", target_url: TARGET_URL, sha: SHA },
      },
    });

    expect(github.rest.git.createCommit).toHaveBeenCalledWith({
      owner: "TextureHQ",
      repo: "commongrid",
      message: mirrorCommitMessage(512, SHA),
      tree: TREE_SHA,
      parents: [SHA],
    });
    expect(github.rest.git.createRef).toHaveBeenCalledWith({
      owner: "TextureHQ",
      repo: "commongrid",
      ref: "refs/heads/vercel-preview-pr-512",
      sha: MIRROR_SHA,
    });
  });

  it("does not create another commit when the branch already mirrors the reviewed SHA", async () => {
    const mirrorCommit = {
      message: mirrorCommitMessage(512, SHA),
      parents: [{ sha: SHA }],
      tree: { sha: TREE_SHA },
    };
    const github = {
      rest: {
        git: {
          getCommit: vi
            .fn()
            .mockResolvedValueOnce({ data: { message: "source commit", parents: [], tree: { sha: TREE_SHA } } })
            .mockResolvedValueOnce({ data: mirrorCommit }),
          getRef: vi.fn().mockResolvedValue({ data: { object: { sha: MIRROR_SHA } } }),
          createCommit: vi.fn(),
          createRef: vi.fn(),
          updateRef: vi.fn(),
        },
        repos: {
          listPullRequestsAssociatedWithCommit: vi.fn().mockResolvedValue({ data: [pull] }),
          createCommitStatus: vi.fn(),
        },
        pulls: { get: vi.fn() },
      },
    };

    await mirrorApprovedFork({
      github,
      core: createCore(),
      context: {
        repo: { owner: "TextureHQ", repo: "commongrid" },
        payload: { context: "Vercel", state: "failure", target_url: TARGET_URL, sha: SHA },
      },
    });

    expect(github.rest.git.createCommit).not.toHaveBeenCalled();
    expect(github.rest.git.updateRef).not.toHaveBeenCalled();
  });

  it("propagates a verified mirror deployment status to the external PR SHA", async () => {
    const mirrorCommit = {
      message: mirrorCommitMessage(512, SHA),
      parents: [{ sha: SHA }],
      tree: { sha: TREE_SHA },
    };
    expect(parseMirrorCommit(mirrorCommit)).toEqual({ pullNumber: 512, sourceSha: SHA });

    const createCommitStatus = vi.fn().mockResolvedValue({});
    const github = {
      rest: {
        git: {
          getRef: vi.fn().mockResolvedValue({ data: { object: { sha: MIRROR_SHA } } }),
          getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: TREE_SHA } } }),
        },
        pulls: { get: vi.fn().mockResolvedValue({ data: pull }) },
        repos: { createCommitStatus },
      },
    };

    await expect(
      propagateMirrorStatus({
        github,
        core: createCore(),
        commit: mirrorCommit,
        context: { repo: { owner: "TextureHQ", repo: "commongrid" } },
        payload: { sha: MIRROR_SHA, state: "success", target_url: TARGET_URL },
      })
    ).resolves.toBe(true);
    expect(createCommitStatus).toHaveBeenCalledWith({
      owner: "TextureHQ",
      repo: "commongrid",
      sha: SHA,
      state: "success",
      context: "Vercel",
      target_url: TARGET_URL,
      description: "Trusted fork preview is ready",
    });
  });
});
