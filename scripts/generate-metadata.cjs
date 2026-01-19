const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoName = process.env.REPO_NAME || (process.env.GITHUB_REPOSITORY || '').split('/').pop() || 'unknown';
const repoDesc = process.env.REPO_DESC || '';
const repoUrl = process.env.REPO_URL || (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}` : '');
const categories = (process.env.REPO_CATEGORIES || 'ai,generative,image,video').split(',').map(s => s.trim()).filter(Boolean);
const outDir = process.env.OUT_DIR || 'dist';

// Determine updated_at. Prefer commit timestamp (git), then head_commit timestamp from workflow, then current time.
let updatedAt = '';
try {
  const sha = process.env.GITHUB_SHA;
  if (sha) {
    // Use git to get the committer date in ISO 8601 (if available).
    const gitDate = execSync(`git show -s --format=%cI ${sha}`, { encoding: 'utf8' }).trim();
    if (gitDate) updatedAt = gitDate;
  }
} catch (err) {
  // Ignore errors and fall back
}

if (!updatedAt && process.env.HEAD_COMMIT_TIMESTAMP) {
  updatedAt = process.env.HEAD_COMMIT_TIMESTAMP;
}

if (!updatedAt) {
  updatedAt = new Date().toISOString();
}

const metadata = {
  name: repoName,
  description: repoDesc || 'No description',
  url: repoUrl,
  updated_at: updatedAt,
  categories
};

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
console.log('Wrote', path.join(outDir, 'metadata.json'), 'with updated_at:', updatedAt);
