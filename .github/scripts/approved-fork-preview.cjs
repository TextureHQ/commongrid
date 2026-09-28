const VERCEL_CONTEXT = "Vercel";
const VERCEL_DEPLOYMENT_ORIGIN = "https://vercel.com";
const VERCEL_TEAM = "texture";
const VERCEL_PROJECT = "commongrid";
const MIRROR_BRANCH_PREFIX = "vercel-preview-pr-";
const APPROVED_STATES = new Set(["pending", "failure", "error"]);

function isVercelDeploymentStatus(payload) {
  if (payload.context !== VERCEL_CONTEXT || !APPROVED_STATES.has(payload.state)) {
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

function isNotFound(error) {
  return error?.status === 404;
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
  const { data: pulls } = await github.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha: sha });
  const pull = selectExternalPullRequest(pulls, repository, sha);

  if (!pull) {
    core.info(`No open external pull request has ${sha} as its exact head; nothing to mirror`);
    return;
  }

  const branch = mirrorBranchName(pull.number);
  const ref = `heads/${branch}`;
  let existingRef;

  try {
    const response = await github.rest.git.getRef({ owner, repo, ref });
    existingRef = response.data;
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  if (!existingRef) {
    await github.rest.git.createRef({ owner, repo, ref: `refs/${ref}`, sha });
    core.info(`Created ${branch} at ${sha} for external PR #${pull.number}`);
  } else if (existingRef.object.sha !== sha) {
    await github.rest.git.updateRef({ owner, repo, ref, sha, force: true });
    core.info(`Updated ${branch} to ${sha} for external PR #${pull.number}`);
  } else {
    core.info(`${branch} already points to ${sha}; nothing to update`);
  }

  await core.summary
    .addHeading("Approved fork preview")
    .addRaw(`PR #${pull.number} was approved by Vercel for deployment.\n\n`)
    .addTable([
      ["Source", pull.head.repo.full_name],
      ["Reviewed SHA", `\`${sha}\``],
      ["Trusted mirror", `\`${repository}:${branch}\``],
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
  selectExternalPullRequest,
};
