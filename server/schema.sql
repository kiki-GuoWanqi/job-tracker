-- JobTracker SQLite schema

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  position TEXT,
  work_city TEXT,
  application_date TEXT,
  status TEXT,
  interview_round TEXT,
  company_brief TEXT,
  jd_raw TEXT,
  jd_formatted TEXT,
  ai_analysis TEXT,
  company_research TEXT,
  company_research_at TEXT,
  interviews_json TEXT NOT NULL DEFAULT '[]',
  tasks_json TEXT NOT NULL DEFAULT '[]',
  match_score INTEGER,
  match_summary TEXT,
  match_strengths_json TEXT NOT NULL DEFAULT '[]',
  match_gaps_json TEXT NOT NULL DEFAULT '[]',
  match_recommendation TEXT,
  match_score_at TEXT,
  match_resume_id TEXT,
  offer_salary TEXT,
  resume_id TEXT,
  exam_date TEXT,
  next_interview_date TEXT,
  offer_deadline TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL,
  status TEXT,
  round TEXT,
  changed_at TEXT,
  FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_status_app ON status_history(application_id);

CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  label TEXT,
  file_name TEXT,
  text TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
