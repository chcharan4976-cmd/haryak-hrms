-- ============================================================
-- HARYAK ONE — Enterprise Document Management System (EDMS) Migration
-- Haryak Technologies India Private Limited
-- Company Tagline: Empowering Tomorrow’s Solutions, Today.
-- ============================================================

-- 1. Add additive columns to documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'employment_hr',
  ADD COLUMN IF NOT EXISTS subcategory VARCHAR(50),
  ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS issuing_authority VARCHAR(255),
  ADD COLUMN IF NOT EXISTS issue_date DATE,
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS replacement_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS retention_period_months INTEGER DEFAULT 84, -- 7 years standard statutory retention
  ADD COLUMN IF NOT EXISTS checksum_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS requires_acknowledgement BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES users(id);

-- 2. Ensure document_versions table exists with full metadata
CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_size BIGINT,
  mime_type VARCHAR(150),
  checksum_sha256 VARCHAR(64),
  change_summary TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_document_version_number CHECK (version_number > 0),
  UNIQUE(document_id, version_number)
);

-- 3. Configurable Document Categories & Compliance Requirements
CREATE TABLE IF NOT EXISTS document_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  category_group VARCHAR(50) NOT NULL, -- identity_onboarding, employment_hr, payroll_statutory, company_policy
  description TEXT,
  is_mandatory BOOLEAN DEFAULT FALSE,
  has_expiry BOOLEAN DEFAULT FALSE,
  default_retention_months INTEGER DEFAULT 84,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, code)
);

-- 4. Create Performance & Security Indexes
CREATE INDEX IF NOT EXISTS idx_documents_company_status ON documents(company_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_emp_category ON documents(employee_id, category);
CREATE INDEX IF NOT EXISTS idx_documents_expiry_date ON documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_documents_is_archived ON documents(company_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc_id ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_categories_company ON document_categories(company_id, category_group);

-- 5. Row Level Security Policies for EDMS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;

-- Document versions RLS: Users can view versions for documents they have access to
DROP POLICY IF EXISTS "Users view authorized document versions" ON document_versions;
CREATE POLICY "Users view authorized document versions" ON document_versions
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      document_id IN (
        SELECT id FROM documents WHERE
          company_id = (SELECT company_id FROM users WHERE id = auth.uid())
          AND (
            visibility IN ('company_wide', 'company')
            OR employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
            OR public.is_admin_or_hr(auth.uid())
          )
      )
    )
  );

-- Document categories RLS: Authenticated users can view company categories
DROP POLICY IF EXISTS "Users view company document categories" ON document_categories;
CREATE POLICY "Users view company document categories" ON document_categories
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- Admins can manage document categories
DROP POLICY IF EXISTS "Admins manage document categories" ON document_categories;
CREATE POLICY "Admins manage document categories" ON document_categories
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  );
