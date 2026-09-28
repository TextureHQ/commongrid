const VERCEL_CONTEXT = "Vercel";
const VERCEL_DEPLOYMENT_ORIGIN = "https://vercel.com";
const VERCEL_TEAM = "texture";
const VERCEL_PROJECT = "commongrid";
const MIRROR_BRANCH_PREFIX = "vercel-preview-pr-";
const MIRROR_COMMIT_PREFIX = "ci: preview approved fork PR";
const VERCEL_STATES = new Set(["pending", "success", "failure", "error"]);

function isVercelDeploymentStatus(payload) {
  if (payload.context !== VERCEL_CONTEXT || !VERCEL_STATES.has(payload.state)) {
    return false;
  }

  if (typeof payload.target_url !== "string") {
    return false;
  }

  try {
    const url = new URL(payload.target_url);
    const path = url.pathname.split("/").filter(Boolean);

    return (
      url.origin === VERCEL_DEPLOYMENT_ORIGIN &&
      path.length === 3 &&
      path[0] === VERCEL_TEAM &&
      path[1] === VERCEL_PROJECT &&
      /^[A-Za-z0-9]+$/.test(path[2])
    );
  } catch {
    return false;
  }
}

function selectExternalPullRequest(pulls, repository, sha) {
  const matches = pulls.filter((pull) => {
    const baseRepository = pull.base?.repo?.full_name;
    const headRepository = pull.head?.repo?.full_name;

    return (
      pull.state === "open" &&
      pull.head?.sha === sha &&
      baseRepository?.toLowerCase() === repository.toLowerCase() &&
      typeof headRepository === "string" &&
      headRepository.toLowerCase() !== repository.toLowerCase()
    );
  });

  if (matches.length > 1) {
    throw new Error(`Commit ${sha} is the head of multiple open external pull requests`);
  }

  return matches[0] ?? null;
}

function mirrorBranchName(pullNumber) {
  if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
    throw new Error(`Invalid pull request number: ${pullNumber}`);
  }

  return `${MIRROR_BRANCH_PREFIX}${pullNumber}`;
}

function mirrorCommitMessage(pullNumber, sourceSha) {
  return `${MIRROR_COMMIT_PREFIX} #${pullNumber} at ${sourceSha}`;
}

function parseMirrorCommit(commit) {
  const match = commit.message?.match(/^ci: preview approved fork PR #(\d+) at ([0-9a-f]{40})$/);
  if (!match || commit.parents?.length !== 1 || commit.parents[0]?.sha !== match[2]) {
    return null;
  }

  return { pullNumber: Number(match[1]), sourceSha: match[2] };
}

function isNotFound(error) {
  return error?.status === 404;
}

function statusDescription(state) {
  switch (state) {
    case "success":
      return "Trusted fork preview is ready";
    case "pending":
      return "Trusted fork preview is building";
    case "failure":
      return "Trusted fork preview failed";
    default:
      return "Trusted fork preview encountered an error";
  }
}

async function propagateMirrorStatus({ github, context, core, commit, payload }) {
  const mirror = parseMirrorCommit(commit);
  if (!mirror) {
    return false;
  }

  const { owner, repo } = context.repo;
  const branch = mirrorBranchName(mirror.pullNumber);
  let branchRef;

  try {
    const response = await github.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    branchRef = response.data;
  } catch (error) {
    if (isNotFound(error)) {
      core.info(`${branch} no longer exists; ignoring its stale Vercel status`);
      return true;
    }
    throw error;
  }

  if (branchRef.object.sha !== payload.sha) {
    core.info(`${payload.sha} is no longer the tip of ${branch}; ignoring its stale Vercel status`);
    return true;
  }

  const [{ data: pull }, { data: sourceCommit }] = await Promise.all([
    github.rest.pulls.get({ owner, repo, pull_number: mirror.pullNumber }),
    github.rest.git.getCommit({ owner, repo, commit_sha: mirror.sourceSha }),
  ]);
  const repository = `${owner}/${repo}`;
  if (!selectExternalPullRequest([pull], repository, mirror.sourceSha)) {
    core.info(`PR #${mirror.pullNumber} is no longer open at ${mirror.sourceSha}; ignoring the status`);
    return true;
  }

  if (commit.tree?.sha !== sourceCommit.tree?.sha) {
    throw new Error(`Mirror commit ${payload.sha} does not match the reviewed tree at ${mirror.sourceSha}`);
  }

  await github.rest.repos.createCommitStatus({
    owner,
    repo,
    sha: mirror.sourceSha,
    state: payload.state,
    context: VERCEL_CONTEXT,
    target_url: payload.target_url,
    description: statusDescription(payload.state),
  });
  core.info(`Propagated ${payload.state} from ${branch} to external PR #${mirror.pullNumber}`);
  return true;
}

async function mirrorApprovedFork({ github, context, core }) {
  const payload = context.payload;
  if (!isVercelDeploymentStatus(payload)) {
    core.info("Ignoring a status that is not an approved Vercel deployment");
    return;
  }

  const sha = payload.sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Invalid status SHA: ${sha}`);
  }

  const { owner, repo } = context.repo;
  const repository = `${owner}/${repo}`;
  const { data: statusCommit } = await github.rest.git.getCommit({ owner, repo, commit_sha: sha });
  if (await propagateMirrorStatus({ github, context, core, commit: statusCommit, payload })) {
    return;
  }

  const { data: pulls } = await github.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha: sha });
  const pull = selectExternalPullRequest(pulls, repository, sha);

  if (!pull) {
    core.info(`No open external pull request has ${sha} as its exact head; nothing to mirror`);
    return;
  }

  const branch = mirrorBranchName(pull.number);
  const ref = `heads/${branch}`;
  let existingRef;
  let existingCommit;

  try {
    const response = await github.rest.git.getRef({ owner, repo, ref });
    existingRef = response.data;
    const commitResponse = await github.rest.git.getCommit({ owner, repo, commit_sha: existingRef.object.sha });
    existingCommit = commitResponse.data;
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  const message = mirrorCommitMessage(pull.number, sha);
  const currentMirror =
    existingCommit?.message === message &&
    existingCommit.parents?.length === 1 &&
    existingCommit.parents[0]?.sha === sha &&
    existingCommit.tree?.sha === statusCommit.tree?.sha;
  let mirrorSha = existingRef?.object.sha;

  if (!currentMirror) {
    const { data: mirrorCommit } = await github.rest.git.createCommit({
      owner,
      repo,
      message,
      tree: statusCommit.tree.sha,
      parents: [sha],
    });
    mirrorSha = mirrorCommit.sha;

    if (!existingRef) {
      await github.rest.git.createRef({ owner, repo, ref: `refs/${ref}`, sha: mirrorSha });
      core.info(`Created ${branch} at trusted mirror ${mirrorSha} for external PR #${pull.number}`);
    } else {
      await github.rest.git.updateRef({ owner, repo, ref, sha: mirrorSha, force: true });
      core.info(`Updated ${branch} to trusted mirror ${mirrorSha} for external PR #${pull.number}`);
    }
  } else {
    core.info(`${branch} already mirrors reviewed SHA ${sha}; nothing to update`);
  }

  await core.summary
    .addHeading("Approved fork preview")
    .addRaw(`PR #${pull.number} was approved by Vercel for deployment.\n\n`)
    .addTable([
      ["Source", pull.head.repo.full_name],
      ["Reviewed SHA", `\`${sha}\``],
      ["Trusted mirror", `\`${repository}:${branch}@${mirrorSha}\``],
    ])
    .addRaw("\nVercel will deploy the trusted mirror; the Neon integration will inject an isolated preview database.")
    .write();
}

async function deleteMirrorForClosedPullRequest({ github, context, core }) {
  const pull = context.payload.pull_request;
  if (!pull || pull.state !== "closed") {
    core.info("No closed pull request in this event; nothing to clean up");
    return;
  }

  const repository = `${context.repo.owner}/${context.repo.repo}`;
  const headRepository = pull.head?.repo?.full_name;
  if (typeof headRepository === "string" && headRepository.toLowerCase() === repository.toLowerCase()) {
    core.info(`PR #${pull.number} came from the canonical repository; no fork mirror exists`);
    return;
  }

  const branch = mirrorBranchName(pull.number);
  const ref = `heads/${branch}`;

  try {
    await github.rest.git.deleteRef({ ...context.repo, ref });
    core.info(`Deleted ${branch} after external PR #${pull.number} closed`);
  } catch (error) {
    if (isNotFound(error)) {
      core.info(`${branch} does not exist; nothing to delete`);
      return;
    }

    throw error;
  }
}

module.exports = {
  deleteMirrorForClosedPullRequest,
  isVercelDeploymentStatus,
  mirrorApprovedFork,
  mirrorBranchName,
  mirrorCommitMessage,
  parseMirrorCommit,
  propagateMirrorStatus,
  selectExternalPullRequest,
};
