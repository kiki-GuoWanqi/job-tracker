// snake_case (DB) <-> camelCase (前端/API) 映射 + JSON 列序列化

const JSON_FIELDS = new Set([
  'interviews',
  'tasks',
  'matchStrengths',
  'matchGaps'
]);

const APPLICATION_COLUMNS = [
  ['id', 'id'],
  ['company_name', 'companyName'],
  ['position', 'position'],
  ['work_city', 'workCity'],
  ['application_date', 'applicationDate'],
  ['status', 'status'],
  ['interview_round', 'interviewRound'],
  ['company_brief', 'companyBrief'],
  ['jd_raw', 'jdRaw'],
  ['jd_formatted', 'jdFormatted'],
  ['ai_analysis', 'aiAnalysis'],
  ['company_research', 'companyResearch'],
  ['company_research_at', 'companyResearchAt'],
  ['interviews_json', 'interviews'],
  ['tasks_json', 'tasks'],
  ['match_score', 'matchScore'],
  ['match_summary', 'matchSummary'],
  ['match_strengths_json', 'matchStrengths'],
  ['match_gaps_json', 'matchGaps'],
  ['match_recommendation', 'matchRecommendation'],
  ['match_score_at', 'matchScoreAt'],
  ['match_resume_id', 'matchResumeId'],
  ['offer_salary', 'offerSalary'],
  ['resume_id', 'resumeId'],
  ['exam_date', 'examDate'],
  ['next_interview_date', 'nextInterviewDate'],
  ['offer_deadline', 'offerDeadline'],
  ['notes', 'notes'],
  ['greeting_message', 'greetingMessage'],
  ['greeting_message_at', 'greetingMessageAt'],
  ['cover_letter', 'coverLetter'],
  ['cover_letter_at', 'coverLetterAt'],
  ['display_order', 'displayOrder'],
  ['created_at', 'createdAt'],
  ['updated_at', 'updatedAt']
];

const NUMERIC_NULLABLE_FIELDS = new Set(['matchScore', 'displayOrder']);

export const APP_DB_COLUMNS = APPLICATION_COLUMNS.map(([db]) => db);

export function rowToApplication(row, statusHistory = []) {
  if (!row) return null;
  const out = {};
  for (const [db, camel] of APPLICATION_COLUMNS) {
    let v = row[db];
    if (JSON_FIELDS.has(camel)) {
      try { v = v ? JSON.parse(v) : []; } catch { v = []; }
    }
    out[camel] = v ?? (JSON_FIELDS.has(camel) ? [] : (NUMERIC_NULLABLE_FIELDS.has(camel) ? null : ''));
  }
  out.statusHistory = statusHistory.map(h => ({
    status: h.status || '',
    round: h.round || '',
    changedAt: h.changed_at || ''
  }));
  return out;
}

export function applicationToRow(app) {
  const row = {};
  for (const [db, camel] of APPLICATION_COLUMNS) {
    let v = app[camel];
    if (JSON_FIELDS.has(camel)) {
      v = JSON.stringify(Array.isArray(v) ? v : []);
    } else if (v === undefined || v === null) {
      v = NUMERIC_NULLABLE_FIELDS.has(camel) ? null : '';
    }
    row[db] = v;
  }
  return row;
}

export function rowToResume(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label || '',
    fileName: row.file_name || '',
    text: row.text || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function resumeToRow(r) {
  return {
    id: r.id,
    label: r.label || '',
    file_name: r.fileName || '',
    text: r.text || '',
    created_at: r.createdAt || new Date().toISOString(),
    updated_at: r.updatedAt || new Date().toISOString()
  };
}
