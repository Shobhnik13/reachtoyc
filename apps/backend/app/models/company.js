'use strict';

const {and, asc, eq, inArray, sql} = require('drizzle-orm');

const utilsService = require('app/services/utils');

const {companies, drafts, founders} = require('app/models/schema');

const database = require('app/configs/database');

async function createCompanies(params) {
  if (!params.runId || !params.companies) {
    throw new Error('input_missing');
  }

  if (!params.companies.length) {
    return 0;
  }

  let _insert = params.companies.map((c, i) => ({
    run_id: params.runId,
    slug: c.slug,
    name: c.name,
    batch: c.batch,
    position: i,
    website: c.website || '',
    domain: c.domain || '',
    one_liner: c.oneLiner || '',
    industry: c.industry || '',
    team_size: c.teamSize ?? null
  }));

  for (let rows of utilsService.chunk(_insert, 500)) {
    await database.db().insert(companies).values(rows).onConflictDoNothing();
  }

  return _insert.length;
}

async function getCompanies(params) {
  if (!params.runId && !params.companyIds) {
    throw new Error('input_missing');
  }

  let query = database
    .db()
    .select()
    .from(companies)
    .where(and(..._filters(params)))
    .orderBy(asc(companies.position));

  params.limit ? query.limit(params.limit) : null;
  params.offset ? query.offset(params.offset) : null;

  let rows = utilsService.sanitizeSqlResult(await query);

  if (!params.withChildren || !rows.length) {
    return rows;
  }

  let ids = rows.map((r) => r.id);
  let founderRows = await database.db().select().from(founders).where(and(inArray(founders.company_id, ids), eq(founders.active, true))).orderBy(asc(founders.id));
  let draftRows = await database.db().select().from(drafts).where(inArray(drafts.company_id, ids));

  return _collate(rows, utilsService.sanitizeSqlResult(founderRows), utilsService.sanitizeSqlResult(draftRows));
}

async function getCompany(params) {
  if (!params.companyId) {
    throw new Error('input_missing');
  }

  let result = await getCompanies({companyIds: [params.companyId], withChildren: true});
  return result.length ? result[0] : null;
}

async function countCompanies(params) {
  if (!params.runId) {
    throw new Error('input_missing');
  }

  let result = await database
    .db()
    .select({count: sql`count(*)::int`})
    .from(companies)
    .where(and(..._filters(params)));

  return result[0].count;
}

async function updateCompany(params) {
  if (!params.companyId) {
    throw new Error('input_missing');
  }

  let _update = {updated_at: new Date()};
  params.status ? (_update.status = params.status) : null;
  params.hasOwnProperty('error') ? (_update.error = params.error) : null;
  params.hasOwnProperty('website') ? (_update.website = params.website) : null;
  params.hasOwnProperty('domain') ? (_update.domain = params.domain) : null;
  params.hasOwnProperty('linkedin') ? (_update.linkedin = params.linkedin) : null;
  params.hasOwnProperty('twitter') ? (_update.twitter = params.twitter) : null;
  params.siteEmails ? (_update.site_emails = params.siteEmails) : null;
  params.name ? (_update.name = params.name) : null;
  params.hasOwnProperty('oneLiner') ? (_update.one_liner = params.oneLiner) : null;
  params.hasOwnProperty('industry') ? (_update.industry = params.industry) : null;
  params.hasOwnProperty('teamSize') ? (_update.team_size = params.teamSize) : null;
  params.jobs ? ((_update.jobs = params.jobs), (_update.job_count = params.jobs.length)) : null;

  await database.db().update(companies).set(_update).where(eq(companies.id, params.companyId));
}

async function updateCompanies(params) {
  if (!params.runId || !params.fromStatus || !params.status) {
    throw new Error('input_missing');
  }

  await database
    .db()
    .update(companies)
    .set({status: params.status, error: null, updated_at: new Date()})
    .where(and(eq(companies.run_id, params.runId), eq(companies.status, params.fromStatus)));
}

function _filters(params) {
  let filters = [eq(companies.active, true)];
  params.runId ? filters.push(eq(companies.run_id, params.runId)) : null;
  params.companyIds ? filters.push(inArray(companies.id, params.companyIds)) : null;
  params.statuses ? filters.push(inArray(companies.status, params.statuses)) : null;
  params.withoutGeneratedDraft ? filters.push(sql`not exists (select 1 from drafts d where d.company_id = ${companies.id} and d.status = 'generated')`) : null;

  if (params.q) {
    let pattern = `%${params.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(sql`(${companies.name} ilike ${pattern} or exists (select 1 from founders f where f.company_id = ${companies.id} and f.active and f.name ilike ${pattern}))`);
  }

  if (params.hasOwnProperty('sent')) {
    let sentDraft = sql`exists (select 1 from drafts d where d.company_id = ${companies.id} and d.sent)`;
    filters.push(params.sent ? sentDraft : sql`not ${sentDraft}`);
  }

  return filters;
}

function _collate(rows, founderRows, draftRows) {
  return rows.map((c) => ({
    ...c,
    founders: founderRows.filter((f) => f.company_id === c.id),
    draft: draftRows.find((d) => d.company_id === c.id) || null
  }));
}

module.exports = {createCompanies, getCompanies, getCompany, countCompanies, updateCompany, updateCompanies};
