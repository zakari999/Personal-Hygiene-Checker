import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const GIT_TIMEOUT_MS = 60000; // 60 seconds max for network git operations
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0', // Never hang waiting for interactive terminal credentials
  GIT_ASKPASS: 'echo'
};

function debugLog(context, err) {
  if (process.env.DEBUG_HYGIENE) {
    console.debug(`[debug:ingestor] ${context}:`, err?.message || err);
  }
}

/**
 * Safely executes git commands using execFileSync without shell invocation.
 */
function safeGit(args, options = {}) {
  return execFileSync('git', args, {
    stdio: 'pipe',
    timeout: GIT_TIMEOUT_MS,
    env: GIT_ENV,
    ...options
  }).toString().trim();
}

/**
 * Normalizes a repo input string into a standard git clone URL or local directory.
 */
export function normalizeRepoInput(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    throw new Error('Repository URL or local directory path is required.');
  }

  // Expand home directory if input begins with ~
  let expandedPath = trimmed;
  if (expandedPath.startsWith('~/') || expandedPath === '~') {
    expandedPath = path.join(os.homedir(), expandedPath.slice(1));
  }

  // Check if it's an existing local directory
  if (fs.existsSync(expandedPath)) {
    try {
      const stat = fs.statSync(expandedPath);
      if (stat.isDirectory()) {
        const resolved = path.resolve(expandedPath);
        return { isLocal: true, path: resolved, name: path.basename(resolved) };
      }
    } catch (err) {
      debugLog('Local directory check fallback', err);
    }
  }

  // GitHub & Git URL parsing
  let cleanUrl = trimmed;

  // Handle tree/branch URLs: https://github.com/owner/repo/tree/main -> https://github.com/owner/repo with branch
  const treeMatch = cleanUrl.match(/^(https?:\/\/github\.com\/[^\/]+\/[^\/]+)\/tree\/([^\/\s\?#]+)/i);
  let branch = null;
  if (treeMatch) {
    cleanUrl = treeMatch[1];
    branch = treeMatch[2];
  }

  // Support both HTTPS (https://github.com/owner/repo) and SSH (git@github.com:owner/repo.git)
  const ghMatch = cleanUrl.match(/github\.com[:\/]([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+?)(\.git)?(\/|$)/i);
  if (ghMatch) {
    const owner = ghMatch[1];
    const repo = ghMatch[2].replace(/\.git$/i, '');

    // Validate sanitized owner and repo names
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(owner) || !/^[a-zA-Z0-9_\-\.]+$/.test(repo)) {
      throw new Error(`Invalid GitHub repository identifiers in "${input}".`);
    }

    if (branch && !/^[a-zA-Z0-9_\-\.\/]+$/.test(branch)) {
      throw new Error(`Invalid git branch name "${branch}".`);
    }

    return {
      isLocal: false,
      owner,
      repo,
      name: `${owner}/${repo}`,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      branch
    };
  }

  // Generic git URL fallback (GitLab, Bitbucket, self-hosted)
  const genericMatch = cleanUrl.match(/^(https?:\/\/[^\/]+\/([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+?)(\.git)?)$/i);
  if (genericMatch) {
    const owner = genericMatch[2];
    const repo = genericMatch[3].replace(/\.git$/i, '');
    return {
      isLocal: false,
      owner,
      repo,
      name: `${owner}/${repo}`,
      cloneUrl: cleanUrl.endsWith('.git') ? cleanUrl : `${cleanUrl}.git`,
      branch
    };
  }

  throw new Error(`Invalid repository URL or path: "${input}". Expected a valid local folder path or git URL (e.g. https://github.com/owner/repo).`);
}

/**
 * Clones or pulls a GitHub repository into a local cache directory using secure array args.
 */
export function syncRepository(target, cacheBaseDir = process.env.REPOS_CACHE_DIR || path.resolve(process.cwd(), '.repos_cache')) {
  if (target.isLocal) {
    return target.path;
  }

  if (!fs.existsSync(cacheBaseDir)) {
    fs.mkdirSync(cacheBaseDir, { recursive: true });
  }

  const safeOwner = target.owner.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const safeRepo = target.repo.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const repoFolderName = `${safeOwner}__${safeRepo}`;
  const repoPath = path.join(cacheBaseDir, repoFolderName);

  if (fs.existsSync(repoPath) && fs.existsSync(path.join(repoPath, '.git'))) {
    try {
      safeGit(['fetch', '--all', '--prune'], { cwd: repoPath });
      const currentBranch = safeGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath });
      const targetBranch = target.branch || currentBranch || 'main';

      safeGit(['checkout', targetBranch], { cwd: repoPath });
      safeGit(['pull', 'origin', targetBranch, '--ff-only'], { cwd: repoPath });
      return repoPath;
    } catch (err) {
      // If pull fails (e.g. diverged history), cleanly remove and re-clone
      debugLog('Git pull failed, re-cloning fresh', err);
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  }

  // Fresh shallow clone
  const cloneArgs = ['clone', '--depth', '100'];
  if (target.branch) {
    cloneArgs.push('-b', target.branch);
  }
  cloneArgs.push(target.cloneUrl, repoPath);

  try {
    safeGit(cloneArgs);
  } catch (err) {
    throw new Error(`Failed to clone git repository (${target.cloneUrl}): ${err.message}`);
  }

  return repoPath;
}

/**
 * Extracts and formats commit history from git safely.
 */
export function extractCommitHistory(repoPath) {
  try {
    // Check if repoPath has its own .git folder
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      // Check if a fixture commits.json exists
      const fixtureCommits = path.join(repoPath, 'commits.json');
      if (fs.existsSync(fixtureCommits)) {
        return JSON.parse(fs.readFileSync(fixtureCommits, 'utf-8'));
      }
      // If repoPath is not its own git root, do not leak parent git log
      try {
        const topLevel = safeGit(['rev-parse', '--show-toplevel'], { cwd: repoPath });
        if (path.resolve(topLevel) !== path.resolve(repoPath)) {
          return [{ hash: 'HEAD', date: 'unknown', author: 'student', subject: 'Initial submission export (no git repo)' }];
        }
      } catch (err) {
        debugLog('Git rev-parse show-toplevel fallback', err);
        return [{ hash: 'HEAD', date: 'unknown', author: 'student', subject: 'Initial submission export (no git repo)' }];
      }
    }

    const rawLog = safeGit(['log', '-n', '50', '--pretty=format:%h%x09%ad%x09%an%x09%s', '--date=short'], {
      cwd: repoPath
    });

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
    debugLog('Extract commit history fallback', err);
    return [{ hash: 'HEAD', date: 'unknown', author: 'student', subject: 'Initial commit (shallow/exported)' }];
  }
}

/**
 * Checks for truncated content at the end of markdown files.
 */
export function checkMarkdownTruncation(content) {
  if (!content) return { isTruncated: true, details: 'File is empty.' };

  const lines = content.split(/\r?\n/);
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && lines[lastIdx].trim() === '') {
    lastIdx--;
  }

  if (lastIdx < 0) return { isTruncated: true, details: 'File has only whitespace.' };

  const lastLine = lines[lastIdx].trim();
  const lineNumber = lastIdx + 1;

  // 1. Unclosed code block fences (e.g. ``` without closing ```)
  const codeFences = (content.match(/^```/gm) || []).length;
  if (codeFences % 2 !== 0) {
    return {
      isTruncated: true,
      lineNumber,
      lastLine,
      details: 'Unclosed code block (missing closing ``` fence)'
    };
  }

  // 2. Ends mid-word or open quotation e.g. "Proof sits in "About Whe
  const danglingWordPattern = /\b(the|and|or|with|in|to|of|about|for|from|by|that|this|which|is|are|whe|th|wh)$/i;
  const quoteCount = (lastLine.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    return {
      isTruncated: true,
      lineNumber,
      lastLine,
      details: `Cuts off with an unclosed quotation mark: "${lastLine}"`
    };
  }

  // 3. Unclosed markdown link or bracket: e.g. [some text](http... or [text without
  if (/\[[^\]]*$/.test(lastLine) || /\[.*?\]\([^\)]*$/.test(lastLine)) {
    return {
      isTruncated: true,
      lineNumber,
      lastLine,
      details: `Unclosed markdown bracket or link: "${lastLine}"`
    };
  }

  // 4. Ends with trailing dangling word
  if (danglingWordPattern.test(lastLine)) {
    return {
      isTruncated: true,
      lineNumber,
      lastLine,
      details: `Cuts off mid-sentence on dangling word: "${lastLine}"`
    };
  }

  // 5. Unclosed markdown table row (starts with | but doesn't end with | or has uneven pipes)
  if (lastLine.startsWith('|') && !lastLine.endsWith('|')) {
    return {
      isTruncated: true,
      lineNumber,
      lastLine,
      details: `Incomplete markdown table row: "${lastLine}"`
    };
  }

  // 6. Trailing dangling dash, trailing ellipsis, or unclosed parenthesis at end of sentence
  if (/—$|(?<!\([^\)]*)\($|\.{3,}$|\\$/.test(lastLine)) {
    return {
      isTruncated: true,
      lineNumber,
      lastLine,
      details: `Cuts off on trailing punctuation or ellipsis: "${lastLine}"`
    };
  }

  return { isTruncated: false };
}

/**
 * Recursively scans directory for files, ignoring .git, node_modules, etc.
 */
export function scanDirectory(dir, baseDir = dir) {
  const ignoreList = new Set(['.git', 'node_modules', '.repos_cache', 'dist', 'build', '.next', '.cache', '.turbo', 'coverage']);
  let results = [];

  try {
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
  } catch (err) {
    console.warn(`Warning: Could not read directory "${dir}":`, err.message);
  }

  return results;
}

/**
 * Checks if a buffer is binary (contains null bytes in first 1024 bytes).
 */
function isBinaryFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(1024);
    const bytesRead = fs.readSync(fd, buffer, 0, 1024, 0);
    fs.closeSync(fd);

    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true;
    }
    return false;
  } catch (err) {
    debugLog('Binary file check error, assuming binary', err);
    return true;
  }
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
  const readmeCandidates = ['README.md', 'readme.md', 'README', 'REPORT.md', 'report.md', 'index.md', 'submission.md'];
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
    try {
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
    } catch (err) {
      console.warn(`Could not read primary report "${primaryReadmePath.relPath}":`, err.message);
    }
  }

  // Identify secondary source files (HTML, CSS, JS, TS, Python, Java, etc.)
  const priorityExtensions = [
    '.html', '.htm', '.css', '.scss', '.sass',
    '.js', '.mjs', '.cjs', '.jsx',
    '.ts', '.tsx',
    '.py', '.java', '.go', '.rs', '.php', '.sql',
    '.json', '.yml', '.yaml'
  ];
  const excludedFiles = new Set(['commits.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

  const secondaryFiles = allFiles
    .filter(f => !primaryReadmePath || f.relPath !== primaryReadmePath.relPath)
    .filter(f => !excludedFiles.has(path.basename(f.relPath)))
    .filter(f => {
      const ext = path.extname(f.relPath).toLowerCase();
      return priorityExtensions.includes(ext);
    })
    .sort((a, b) => {
      const depthA = a.relPath.split('/').length;
      const depthB = b.relPath.split('/').length;
      if (depthA !== depthB) return depthA - depthB;
      return a.relPath.localeCompare(b.relPath);
    })
    .slice(0, 15); // inspect up to 15 key files

  for (const file of secondaryFiles) {
    try {
      const stat = fs.statSync(file.fullPath);
      // Skip large files (> 300KB) and binary files
      if (stat.size > 300 * 1024 || isBinaryFile(file.fullPath)) continue;

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
    } catch (err) {
      debugLog(`Skipping unreadable source file "${file.relPath}"`, err);
    }
  }

  // Detect referenced design assets (e.g., docs/sketch.png, wireframe.png)
  const designAssets = [];
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
  const imageFiles = allFiles.filter(f => imageExtensions.includes(path.extname(f.relPath).toLowerCase()));

  for (const img of imageFiles) {
    try {
      const stat = fs.statSync(img.fullPath);
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
    } catch (err) {
      debugLog(`Skipping unreadable design asset "${img.relPath}"`, err);
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
