import {readFile} from 'node:fs/promises';
import path from 'node:path';

const REPO_GUIDE = 'https://github.com/Shobhnik13/reachtoyc/blob/main/AGENTS.md';

// The repo's AGENTS.md is the single source; the frontend runs from apps/frontend
export async function agentGuide(): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), '..', '..', 'AGENTS.md'), 'utf8');
  } catch {
    return `# reachtoyc: setup guide for AI agents\n\nThe full guide is at ${REPO_GUIDE}\n`;
  }
}
