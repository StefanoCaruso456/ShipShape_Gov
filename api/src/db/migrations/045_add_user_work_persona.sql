ALTER TABLE users
ADD COLUMN IF NOT EXISTS work_persona TEXT
CHECK (work_persona IN ('product_manager', 'engineer', 'engineering_manager', 'designer', 'qa', 'ops_platform', 'stakeholder', 'other'));
