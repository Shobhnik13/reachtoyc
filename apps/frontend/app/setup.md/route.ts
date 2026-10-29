import {agentGuide} from '@/lib/agent-guide';

export const dynamic = 'force-static';

export async function GET() {
  return new Response(await agentGuide(), {headers: {'Content-Type': 'text/markdown; charset=utf-8'}});
}
