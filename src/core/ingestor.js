import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Normalizes a repo input string into a standard git clone URL or local directory.
 */
export function normalizeRepoInput(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    throw new Error('Repository URL or local directory path is required.');
  }

  // Check if it's an existing local directory
  if (fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory()) {
    return { isLocal: true, path: path.resolve(trimmed), name: path.basename(trimmed) };
  }

  // GitHub URL parsing
  let cleanUrl = trimmed;
  // Handle tree/branch URLs: https://github.com/owner/repo/tree/main -> https://github.com/owner/repo
  const treeMatch = cleanUrl.match(/^(https?:\/\/github\.com\/[^\/]+\/[^\/]+)\/tree\/([^\/]+)/i);
  let branch = null;
  if (treeMatch) {
    cleanUrl = treeMatch[1];
    branch = treeMatch[2];
  }

  // Strip trailing slashes and .git if present
  const gitUrlMatch = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/i);
  if (!gitUrlMatch) {
    throw new Error(`Invalid GitHub repository URL: "${input}". Expected format: https://github.com/owner/repo`);
  }

  const owner = gitUrlMatch[1];
  const repo = gitUrlMatch[2];
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;

  return {
    isLocal: false,
    owner,
    repo,
    name: `${owner}/${repo}`,
    cloneUrl,
    branch
  };
}

/**
 * Clones or pulls a GitHub repository into a local cache directory.
 */
export function syncRepository(target, cacheBaseDir = path.resolve(process.cwd(), '.repos_cache')) {
  if (target.isLocal) {
    return target.path;
  }

  if (!fs.existsSync(cacheBaseDir)) {
    fs.mkdirSync(cacheBaseDir, { recursive: true });
  }

  const repoFolderName = `${target.owner}__${target.repo}`;
  const repoPath = path.join(cacheBaseDir, repoFolderName);

  if (fs.existsSync(repoPath) && fs.existsSync(path.join(repoPath, '.git'))) {
    try {
      // Pull latest changes
      execSync('git fetch --all --prune', { cwd: repoPath, stdio: 'pipe' });
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath, stdio: 'pipe' }).toString().trim();
      const targetBranch = target.branch || currentBranch || 'main';
      execSync(`git checkout ${targetBranch}`, { cwd: repoPath, stdio: 'pipe' });
      execSync(`git pull origin ${targetBranch} --ff-only`, { cwd: repoPath, stdio: 'pipe' });
      return repoPath;
    } catch {
      // If pull fails (e.g. diverged), remove and fresh clone
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  }

  // Fresh shallow clone with commit history
  const branchFlag = target.branch ? `-b ${target.branch}` : '';
  const cmd = `git clone --depth 100 ${branchFlag} "${target.cloneUrl}" "${repoPath}"`;
  execSync(cmd, { stdio: 'pipe' });

  return repoPath;
}

/**
 * Extracts and formats commit history from git.
 */
export function extractCommitHistory(repoPath) {
  try {
    const rawLog = execSync('git log -n 50 --pretty=format:"%h%x09%ad%x09%an%x09%s" --date=short', {
      cwd: repoPath,
      stdio: 'pipe'
    }).toString().trim();

    if (!rawLog) return [];

    const lines = rawLog.split('\n');
    return lines.map((line) => {
      const parts = line.split('\t');
      return {
        hash: parts[0] || '',
        date: parts[1] || '',
        author: parts[2] || '',
        subject: parts[3] || ''
      };
    });
  } catch (err) {
    return [{ hash: 'HEAD', date: 'unknown', author: 'unknown', subject: 'Initial commit (shallow/exported)' }];
  }
}

/**
 * Checks for truncated content at the end of markdown files.
 */
export function checkMarkdownTruncation(content) {
  if (!content) return { isTruncated: true, details: 'File is empty.' };

  const lines = content.split(/\r?\n/);
  // Find last non-empty line
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && lines[lastIdx].trim() === '') {
    lastIdx--;
  }

  if (lastIdx < 0) return { isTruncated: true, details: 'File has only whitespace.' };

  const lastLine = lines[lastIdx].trim();
  const lineNumber = lastIdx + 1;

  // Patterns indicating truncation:
  // 1. Ends mid-word or open quotation e.g. "Proof sits in "About Whe
  // 2. Ends with trailing dangling conjunction: "and", "or", "the", "with", "in", "to", "but"
  // 3. Unclosed markdown table row (starts with | but doesn't end with | or has uneven pipes)
  // 4. Missing terminal punctuation on a long prose sentence
  const danglingWordPattern = /\b(the|and|or|with|in|to|of|about|for|from|by|that|this|which|is|are|whe|th|wh)$/i;
  const oddQuotes = (lastLine.match(/"/g) || []).length % 2 !== 0;

  if (oddQuotes) {
    return {
      isTruncated: true,
      lineNumber,
      lastLine,
      details: `Cuts off with an unclosed quotation mark: "${lastLine}"`
    };
  }

  if (danglingWordPattern.test(lastLine)) {
    return {
      isTruncated: true,
      lineNumber,
      lastLine,
      details: `Cuts off mid-sentence on dangling word: "${lastLine}"`
    };
  }

  if (lastLine.startsWith('|') && !lastLine.endsWith('|')) {
    return {
      isTruncated: true,
      lineNumber,
      lastLine,
      details: `Incomplete markdown table row: "${lastLine}"`
    };
  }

  return { isTruncated: false };
}

/**
 * Recursively scans directory for files, ignoring .git, node_modules, etc.
 */
export function scanDirectory(dir, baseDir = dir) {
  const ignoreList = new Set(['.git', 'node_modules', '.repos_cache', 'dist', 'build', '.next', '.cache']);
  let results = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoreList.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      results = results.concat(scanDirectory(fullPath, baseDir));
    } else {
      results.push({ fullPath, relPath });
    }
  }

  return results;
}

/**
 * Inspects repository and generates line-numbered artifacts.
 */
export function ingestRepository(inputUrlOrPath) {
  const target = normalizeRepoInput(inputUrlOrPath);
  const repoPath = syncRepository(target);
  const commits = extractCommitHistory(repoPath);
  const allFiles = scanDirectory(repoPath);

  // Identify artifact 1 (Primary README / Report)
  const readmeCandidates = ['README.md', 'readme.md', 'README', 'REPORT.md', 'report.md', 'index.md'];
  let primaryReadmePath = null;
  for (const candidate of readmeCandidates) {
    const found = allFiles.find(f => f.relPath.toLowerCase() === candidate.toLowerCase());
    if (found) {
      primaryReadmePath = found;
      break;
    }
  }

  const artifacts = [];
  let artifactIndex = 1;

  if (primaryReadmePath) {
    const raw = fs.readFileSync(primaryReadmePath.fullPath, 'utf-8');
    const lines = raw.split(/\r?\n/);
    const numbered = lines.map((l, i) => `line ${i + 1}: ${l}`).join('\n');
    const truncation = checkMarkdownTruncation(raw);

    artifacts.push({
      index: artifactIndex++,
      name: primaryReadmePath.relPath,
      isPrimaryReport: true,
      lineCount: lines.length,
      rawContent: raw,
      contentNumbered: numbered,
      isTruncated: truncation.isTruncated,
      truncation
    });
  }

  // Identify secondary source files (HTML, CSS, JS, etc.)
  const priorityExtensions = ['.html', '.css', '.js', '.ts', '.py', '.json'];
  const secondaryFiles = allFiles
    .filter(f => !primaryReadmePath || f.relPath !== primaryReadmePath.relPath)
    .filter(f => {
      const ext = path.extname(f.relPath).toLowerCase();
      return priorityExtensions.includes(ext);
    })
    // Prioritize root-level files or core src
    .sort((a, b) => {
      const depthA = a.relPath.split('/').length;
      const depthB = b.relPath.split('/').length;
      if (depthA !== depthB) return depthA - depthB;
      return a.relPath.localeCompare(b.relPath);
    })
    .slice(0, 10); // inspect up to 10 key files

  for (const file of secondaryFiles) {
    try {
      const stat = fs.statSync(file.fullPath);
      // Skip very large files (> 300KB)
      if (stat.size > 300 * 1024) continue;

      const raw = fs.readFileSync(file.fullPath, 'utf-8');
      const lines = raw.split(/\r?\n/);
      const numbered = lines.map((l, i) => `line ${i + 1}: ${l}`).join('\n');

      artifacts.push({
        index: artifactIndex++,
        name: file.relPath,
        isPrimaryReport: false,
        lineCount: lines.length,
        rawContent: raw,
        contentNumbered: numbered
      });
    } catch {
      // ignore unreadable
    }
  }

  // Detect referenced design assets (e.g., docs/sketch.png, wireframe.png)
  const designAssets = [];
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
  const imageFiles = allFiles.filter(f => imageExtensions.includes(path.extname(f.relPath).toLowerCase()));

  for (const img of imageFiles) {
    try {
      const stat = fs.statSync(img.fullPath);
      // Encode images under 2MB for vision models
      let base64 = null;
      let mimeType = 'image/png';
      if (stat.size <= 2 * 1024 * 1024) {
        base64 = fs.readFileSync(img.fullPath).toString('base64');
        const ext = path.extname(img.relPath).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.svg') mimeType = 'image/svg+xml';
        else if (ext === '.webp') mimeType = 'image/webp';
      }

      designAssets.push({
        relPath: img.relPath,
        exists: true,
        sizeBytes: stat.size,
        mimeType,
        base64
      });
    } catch {
      // ignore
    }
  }

  return {
    target,
    repoPath,
    fileTree: allFiles.map(f => f.relPath),
    commits,
    artifacts,
    designAssets
  };
}
