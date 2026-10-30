'use client';

import {useRouter} from 'next/navigation';
import {useState} from 'react';

import {Spinner} from '@/components/Spinner';
import {api, DEFAULT_MODELS, SAFE_DAILY_SENDS, type Profile, type Provider} from '@/lib/api';
import {toast} from '@/lib/toast';

const PROVIDERS: {value: Provider; label: string}[] = [
  {value: 'anthropic', label: 'Claude (Anthropic)'},
  {value: 'openai', label: 'OpenAI'},
  {value: 'gemini', label: 'Gemini (Google)'}
];

const KeyStatus = ({set, name}: {set?: boolean; name: string}) => (set ? <span className="ok">{name} is set</span> : <span className="err">{name} missing in apps/backend/.env</span>);

export default function ProfileForm({profile}: {profile?: Profile}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile?.name || '',
    ai_provider: profile?.ai_provider || ('anthropic' as Provider),
    ai_model: profile?.ai_model || DEFAULT_MODELS.anthropic,
    apify_max_usd: String(profile?.apify_max_usd ?? 1),
    daily_send_limit: String(profile?.daily_send_limit ?? 30),
    resume_markdown: profile?.resume_markdown || '',
    system_prompt: profile?.system_prompt || '',
    subject_template: profile?.subject_template ?? 'looking out for an engineering opportunity - would love to work as an engineer at {company}'
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({...form, [k]: e.target.value});

  function onProvider(e: React.ChangeEvent<HTMLSelectElement>) {
    const p = e.target.value as Provider;
    setForm({...form, ai_provider: p, ai_model: DEFAULT_MODELS[p]});
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setForm({...form, resume_markdown: await file.text()});
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body: Record<string, unknown> = {
      name: form.name,
      ai_provider: form.ai_provider,
      ai_model: form.ai_model,
      apify_max_usd: parseFloat(form.apify_max_usd) || 1,
      daily_send_limit: Math.min(500, Math.max(1, parseInt(form.daily_send_limit) || 30)),
      resume_markdown: form.resume_markdown,
      subject_template: form.subject_template
    };
    if (form.system_prompt.trim()) body.system_prompt = form.system_prompt;

    try {
      const data = profile
        ? await api<{profile: Profile}>(`/profiles/${profile.id}`, {method: 'PUT', body})
        : await api<{profile: Profile}>('/profiles', {method: 'POST', body});
      toast.success(profile ? 'Profile saved' : 'Profile created');
      if (!profile) return router.push(`/profiles/${data.profile.id}`);
      setForm({...form, system_prompt: data.profile.system_prompt});
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const keyEnv = `${form.ai_provider.toUpperCase()}_API_KEY`;
  const keySet = profile && profile.ai_provider === form.ai_provider ? profile.has_ai_key : undefined;

  return (
    <form onSubmit={save}>
      <section className="panel">
        <h2>AI model</h2>
        <div className="grid">
          <label className="f">Profile name<input required value={form.name} onChange={set('name')} placeholder="Backend roles" /></label>
          <label className="f">
            Provider
            <select value={form.ai_provider} onChange={onProvider}>
              {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label className="f">Model<input required value={form.ai_model} onChange={set('ai_model')} /></label>
        </div>
        <p className="hint">API key: {keySet === undefined ? <>read from <code>{keyEnv}</code> in apps/backend/.env</> : <KeyStatus set={keySet} name={keyEnv} />}. The model researches each company with its own web search tool (Claude web search, OpenAI web_search, Gemini Google Search grounding).</p>
      </section>

      <section className="panel">
        <h2>Verified emails <span className="muted" style={{fontWeight: 400}}>(optional)</span></h2>
        <div className="grid">
          <label className="f">Max USD per Apify run (50 founders)<input type="number" min="0.1" max="100" step="0.1" value={form.apify_max_usd} onChange={set('apify_max_usd')} /></label>
        </div>
        <p className="hint">Token: {profile ? <KeyStatus set={profile.has_apify_token} name="APIFY_TOKEN" /> : <>read from <code>APIFY_TOKEN</code> in apps/backend/.env</>}. Without Apify, emails come from the company site plus pattern guesses like first@domain (right about 80% of the time).</p>
      </section>

      <section className="panel">
        <h2>Your profile (Markdown)</h2>
        <p className="hint" style={{marginTop: 0}}>Everything the AI may say about you: resume, links, experience, projects, what you want next. It is the only source of facts about you.</p>
        <p className="row"><input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={onFile} style={{width: 'auto'}} /></p>
        <textarea className="mono" style={{minHeight: 320}} value={form.resume_markdown} onChange={set('resume_markdown')} placeholder={'# Jane Doe\nPortfolio: https://...\nGitHub: https://github.com/...\nResume: https://...\n\n## Experience\n...'} />
        <p className="hint">{form.resume_markdown.length.toLocaleString()} characters</p>
      </section>

      <section className="panel">
        <h2>Sending</h2>
        <label className="f" style={{maxWidth: 260}}>
          Emails per day
          <input type="number" min="1" max="500" value={form.daily_send_limit} onChange={set('daily_send_limit')} />
        </label>
        <p className="hint">
          The most emails Send and Send all may send from your Gmail in one day. Once today&apos;s limit is reached, sending stops with an error and the rest wait for tomorrow. Gmail itself allows about 500 a day.
        </p>
        {(parseInt(form.daily_send_limit) || 0) > SAFE_DAILY_SENDS ? (
          <p className="status err">More than {SAFE_DAILY_SENDS} emails a day from a personal Gmail can land your emails in spam or get the account flagged. Start around 20-30 and increase slowly.</p>
        ) : (
          <p className="hint">Increasing this to more than {SAFE_DAILY_SENDS} a day can land your emails in spam.</p>
        )}
      </section>

      <section className="panel">
        <h2>Subject line</h2>
        <input value={form.subject_template} onChange={set('subject_template')} placeholder="Leave empty to let the AI write the subject" />
        <p className="hint"><code>{'{company}'}</code> becomes the company name, <code>{'{first_name}'}</code> the founder&apos;s first name. Every draft uses this exact subject, and Regenerate subject applies it instantly with no AI call. Leave it empty to let the AI write subjects.</p>
      </section>

      <section className="panel">
        <h2>System prompt</h2>
        <p className="hint" style={{marginTop: 0}}>How the emails should read: tone, length, structure, what to emphasise. {profile ? '' : 'Leave empty to start from the default and edit it later.'}</p>
        <textarea value={form.system_prompt} onChange={set('system_prompt')} placeholder="Leave empty for the default prompt" />
      </section>

      <p className="row">
        <button className="primary" type="submit" disabled={busy}>{busy ? <><Spinner /> Saving…</> : profile ? 'Save profile' : 'Create profile'}</button>
      </p>
    </form>
  );
}
