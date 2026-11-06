-- ============================================================
-- Migration: 20261102_temporary_employee_id_cards.sql
-- Module: Employee ID Card Studio (Admin-Only)
-- Description: Production-authoritative temporary ID card generation with strict 24-hour expiration lifecycle
-- Security: Fail-closed SECURITY DEFINER authorization, strict company isolation, immutable lifecycle, verified ownership
-- Note: Do NOT execute this migration directly against production without change-window approval.
-- ============================================================

-- ------------------------------------------------------------------------------
-- 1. Table Creation and Explicit Structural Migration (Upgrades Existing Tables Safely)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.temporary_employee_id_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_code VARCHAR(50) NOT NULL,
  design_type VARCHAR(50) NOT NULL DEFAULT 'CORPORATE_ELITE',
  employee_name VARCHAR(255) NOT NULL,
  designation VARCHAR(255),
  department VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  location VARCHAR(255),
  photo_url TEXT,
  card_image_path TEXT,
  card_pdf_path TEXT,
  card_format VARCHAR(20) DEFAULT 'CR80_PORTRAIT',
  dimensions VARCHAR(50) DEFAULT '53.98x85.60mm',
  resolution_dpi INTEGER DEFAULT 300,
  export_resolution VARCHAR(50) DEFAULT '638x1011',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  deleted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ------------------------------------------------------------------------------
-- 2. Comprehensive Structural Validation & Safe Upgrades for All 23 Required Columns
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_col_type TEXT;
  v_is_nullable TEXT;
  v_col_default TEXT;
  v_char_len INTEGER;
  v_null_count INTEGER;
  v_corrupt_count INTEGER;
  v_pk_cols TEXT[];
BEGIN
  -- ----------------------------------------------------------------------------
  -- Column 1: 'id' (UUID, NOT NULL, Exact Single-Column Primary Key, UUID Default)
  -- ----------------------------------------------------------------------------
  SELECT data_type, is_nullable, column_default INTO v_col_type, v_is_nullable, v_col_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'id';

  IF v_col_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.id must be UUID, found %', v_col_type;
  END IF;

  IF v_is_nullable = 'YES' THEN
    RAISE EXCEPTION 'Constraint violation: temporary_employee_id_cards.id must not be nullable.';
  END IF;

  -- Exact primary-key column inspection: verify PK consists of exactly (id)
  SELECT ARRAY(
    SELECT a.attname::text
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.temporary_employee_id_cards'::regclass
      AND c.contype = 'p'
    ORDER BY array_position(c.conkey, a.attnum)
  ) INTO v_pk_cols;

  IF v_pk_cols IS NULL OR array_length(v_pk_cols, 1) = 0 THEN
    ALTER TABLE public.temporary_employee_id_cards ADD PRIMARY KEY (id);
  ELSIF v_pk_cols <> ARRAY['id'] THEN
    RAISE EXCEPTION 'Incompatible primary key: temporary_employee_id_cards primary key is defined on % instead of exactly (id). Manual review required.', v_pk_cols;
  END IF;

  -- Verify UUID default generator (establish gen_random_uuid() if no default is present)
  IF v_col_default IS NULL THEN
    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ELSIF v_col_default NOT LIKE '%gen_random_uuid%' AND v_col_default NOT LIKE '%uuid_generate_v4%' THEN
    RAISE EXCEPTION 'Incompatible column default: temporary_employee_id_cards.id default is "%" instead of a valid UUID generator.', v_col_default;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Column 2: 'company_id' (UUID, NOT NULL)
  -- ----------------------------------------------------------------------------
  SELECT data_type, is_nullable INTO v_col_type, v_is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'company_id';

  IF v_col_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.company_id must be UUID, found %', v_col_type;
  END IF;

  IF v_is_nullable = 'YES' THEN
    SELECT COUNT(*) INTO v_null_count
    FROM public.temporary_employee_id_cards
    WHERE company_id IS NULL;

    IF v_null_count > 0 THEN
      RAISE EXCEPTION 'Safe migration aborted: temporary_employee_id_cards contains % rows with NULL company_id. Tenant assignment cannot be guessed.', v_null_count;
    ELSE
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN company_id SET NOT NULL;
    END IF;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Column 3: 'employee_id' (UUID, nullable for ON DELETE SET NULL compatibility)
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN employee_id UUID;
  ELSE
    SELECT data_type, is_nullable INTO v_col_type, v_is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'employee_id';

    IF v_col_type IS DISTINCT FROM 'uuid' THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.employee_id must be UUID, found %', v_col_type;
    END IF;

    -- Ensure employee_id is nullable to support ON DELETE SET NULL
    IF v_is_nullable = 'NO' THEN
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN employee_id DROP NOT NULL;
    END IF;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Column 4: 'employee_code' (VARCHAR(50), NOT NULL)
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'employee_code'
  ) THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN employee_code VARCHAR(50);
    UPDATE public.temporary_employee_id_cards
    SET employee_code = 'HRK-TEMP-' || upper(substr(id::text, 1, 8))
    WHERE employee_code IS NULL;
    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN employee_code SET NOT NULL;
  ELSE
    SELECT data_type, character_maximum_length, is_nullable INTO v_col_type, v_char_len, v_is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'employee_code';

    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.employee_code must be character varying or text, found %', v_col_type;
    END IF;

    -- Safely reconcile length to VARCHAR(50) without truncation
    IF v_char_len IS DISTINCT FROM 50 THEN
      IF v_char_len IS NULL OR v_char_len > 50 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(employee_code) > 50;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.employee_code has % rows exceeding 50 characters. Truncation prohibited.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN employee_code TYPE VARCHAR(50);
    END IF;

    IF v_is_nullable = 'YES' THEN
      UPDATE public.temporary_employee_id_cards
      SET employee_code = 'HRK-TEMP-' || upper(substr(id::text, 1, 8))
      WHERE employee_code IS NULL;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN employee_code SET NOT NULL;
    END IF;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Column 5: 'design_type' (VARCHAR(50), NOT NULL, DEFAULT 'CORPORATE_ELITE')
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'design_type'
  ) THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN design_type VARCHAR(50) NOT NULL DEFAULT 'CORPORATE_ELITE';
  ELSE
    SELECT data_type, character_maximum_length, is_nullable INTO v_col_type, v_char_len, v_is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'design_type';

    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.design_type must be character varying or text, found %', v_col_type;
    END IF;

    IF v_char_len IS DISTINCT FROM 50 THEN
      IF v_char_len IS NULL OR v_char_len > 50 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(design_type) > 50;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.design_type has % rows exceeding 50 characters. Truncation prohibited.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN design_type TYPE VARCHAR(50);
    END IF;

    IF v_is_nullable = 'YES' THEN
      UPDATE public.temporary_employee_id_cards
      SET design_type = 'CORPORATE_ELITE'
      WHERE design_type IS NULL;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN design_type SET NOT NULL;
    END IF;

    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN design_type SET DEFAULT 'CORPORATE_ELITE';
  END IF;

  -- ----------------------------------------------------------------------------
  -- Column 6: 'employee_name' (VARCHAR(255), NOT NULL)
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'employee_name'
  ) THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN employee_name VARCHAR(255);
    UPDATE public.temporary_employee_id_cards
    SET employee_name = 'Unknown Employee'
    WHERE employee_name IS NULL;
    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN employee_name SET NOT NULL;
  ELSE
    SELECT data_type, character_maximum_length, is_nullable INTO v_col_type, v_char_len, v_is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'employee_name';

    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.employee_name must be character varying or text, found %', v_col_type;
    END IF;

    IF v_char_len IS DISTINCT FROM 255 THEN
      IF v_char_len IS NULL OR v_char_len > 255 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(employee_name) > 255;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.employee_name has % rows exceeding 255 characters. Truncation prohibited.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN employee_name TYPE VARCHAR(255);
    END IF;

    IF v_is_nullable = 'YES' THEN
      UPDATE public.temporary_employee_id_cards
      SET employee_name = 'Unknown Employee'
      WHERE employee_name IS NULL;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN employee_name SET NOT NULL;
    END IF;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Columns 7-11: Optional Details (designation 255, department 255, phone 50, email 255, location 255)
  -- ----------------------------------------------------------------------------
  -- designation (VARCHAR(255))
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'designation') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN designation VARCHAR(255);
  ELSE
    SELECT data_type, character_maximum_length INTO v_col_type, v_char_len FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'designation';
    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.designation must be character varying or text, found %', v_col_type;
    END IF;
    IF v_char_len IS DISTINCT FROM 255 THEN
      IF v_char_len IS NULL OR v_char_len > 255 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(designation) > 255;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.designation has % rows exceeding 255 characters.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN designation TYPE VARCHAR(255);
    END IF;
  END IF;

  -- department (VARCHAR(255))
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'department') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN department VARCHAR(255);
  ELSE
    SELECT data_type, character_maximum_length INTO v_col_type, v_char_len FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'department';
    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.department must be character varying or text, found %', v_col_type;
    END IF;
    IF v_char_len IS DISTINCT FROM 255 THEN
      IF v_char_len IS NULL OR v_char_len > 255 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(department) > 255;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.department has % rows exceeding 255 characters.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN department TYPE VARCHAR(255);
    END IF;
  END IF;

  -- phone (VARCHAR(50))
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'phone') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN phone VARCHAR(50);
  ELSE
    SELECT data_type, character_maximum_length INTO v_col_type, v_char_len FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'phone';
    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.phone must be character varying or text, found %', v_col_type;
    END IF;
    IF v_char_len IS DISTINCT FROM 50 THEN
      IF v_char_len IS NULL OR v_char_len > 50 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(phone) > 50;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.phone has % rows exceeding 50 characters.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN phone TYPE VARCHAR(50);
    END IF;
  END IF;

  -- email (VARCHAR(255))
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'email') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN email VARCHAR(255);
  ELSE
    SELECT data_type, character_maximum_length INTO v_col_type, v_char_len FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'email';
    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.email must be character varying or text, found %', v_col_type;
    END IF;
    IF v_char_len IS DISTINCT FROM 255 THEN
      IF v_char_len IS NULL OR v_char_len > 255 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(email) > 255;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.email has % rows exceeding 255 characters.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN email TYPE VARCHAR(255);
    END IF;
  END IF;

  -- location (VARCHAR(255))
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'location') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN location VARCHAR(255);
  ELSE
    SELECT data_type, character_maximum_length INTO v_col_type, v_char_len FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'location';
    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.location must be character varying or text, found %', v_col_type;
    END IF;
    IF v_char_len IS DISTINCT FROM 255 THEN
      IF v_char_len IS NULL OR v_char_len > 255 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(location) > 255;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.location has % rows exceeding 255 characters.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN location TYPE VARCHAR(255);
    END IF;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Columns 12-14: Asset URLs & Storage Paths (photo_url, card_image_path, card_pdf_path)
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'photo_url') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN photo_url TEXT;
  ELSE
    SELECT data_type INTO v_col_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'photo_url';
    IF v_col_type NOT IN ('text', 'character varying') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.photo_url must be text or character varying, found %', v_col_type;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'card_image_path') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN card_image_path TEXT;
  ELSE
    SELECT data_type INTO v_col_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'card_image_path';
    IF v_col_type NOT IN ('text', 'character varying') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.card_image_path must be text or character varying, found %', v_col_type;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'card_pdf_path') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN card_pdf_path TEXT;
  ELSE
    SELECT data_type INTO v_col_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'card_pdf_path';
    IF v_col_type NOT IN ('text', 'character varying') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.card_pdf_path must be text or character varying, found %', v_col_type;
    END IF;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Columns 15-18: Card Layout Geometry & Resolution (card_format 20, dimensions 50, resolution_dpi INT, export_resolution 50)
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'card_format') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN card_format VARCHAR(20) DEFAULT 'CR80_PORTRAIT';
  ELSE
    SELECT data_type, character_maximum_length INTO v_col_type, v_char_len FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'card_format';
    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.card_format must be character varying or text, found %', v_col_type;
    END IF;
    IF v_char_len IS DISTINCT FROM 20 THEN
      IF v_char_len IS NULL OR v_char_len > 20 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(card_format) > 20;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.card_format has % rows exceeding 20 characters.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN card_format TYPE VARCHAR(20);
    END IF;
    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN card_format SET DEFAULT 'CR80_PORTRAIT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'dimensions') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN dimensions VARCHAR(50) DEFAULT '53.98x85.60mm';
  ELSE
    SELECT data_type, character_maximum_length INTO v_col_type, v_char_len FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'dimensions';
    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.dimensions must be character varying or text, found %', v_col_type;
    END IF;
    IF v_char_len IS DISTINCT FROM 50 THEN
      IF v_char_len IS NULL OR v_char_len > 50 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(dimensions) > 50;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.dimensions has % rows exceeding 50 characters.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN dimensions TYPE VARCHAR(50);
    END IF;
    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN dimensions SET DEFAULT '53.98x85.60mm';
  END IF;

  -- resolution_dpi (Canonical INTEGER, DEFAULT 300)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'resolution_dpi') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN resolution_dpi INTEGER DEFAULT 300;
  ELSE
    SELECT data_type INTO v_col_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'resolution_dpi';
    IF v_col_type = 'smallint' THEN
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN resolution_dpi TYPE INTEGER;
    ELSIF v_col_type IS DISTINCT FROM 'integer' THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.resolution_dpi must be INTEGER, found %', v_col_type;
    END IF;
    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN resolution_dpi SET DEFAULT 300;
  END IF;

  -- export_resolution (VARCHAR(50), DEFAULT '638x1011')
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'export_resolution') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN export_resolution VARCHAR(50) DEFAULT '638x1011';
  ELSE
    SELECT data_type, character_maximum_length INTO v_col_type, v_char_len FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'export_resolution';
    IF v_col_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.export_resolution must be character varying or text, found %', v_col_type;
    END IF;
    IF v_char_len IS DISTINCT FROM 50 THEN
      IF v_char_len IS NULL OR v_char_len > 50 THEN
        SELECT COUNT(*) INTO v_null_count FROM public.temporary_employee_id_cards WHERE length(export_resolution) > 50;
        IF v_null_count > 0 THEN
          RAISE EXCEPTION 'Incompatible column length: temporary_employee_id_cards.export_resolution has % rows exceeding 50 characters.', v_null_count;
        END IF;
      END IF;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN export_resolution TYPE VARCHAR(50);
    END IF;
    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN export_resolution SET DEFAULT '638x1011';
  END IF;

  -- ----------------------------------------------------------------------------
  -- Column 19: 'created_by' (UUID, nullable for ON DELETE SET NULL compatibility)
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'created_by') THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN created_by UUID;
  ELSE
    SELECT data_type, is_nullable INTO v_col_type, v_is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'created_by';

    IF v_col_type IS DISTINCT FROM 'uuid' THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.created_by must be UUID, found %', v_col_type;
    END IF;

    -- Ensure created_by is nullable to support ON DELETE SET NULL
    IF v_is_nullable = 'NO' THEN
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN created_by DROP NOT NULL;
    END IF;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Column 20: 'created_at' (TIMESTAMPTZ, NOT NULL)
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  ELSE
    SELECT data_type, is_nullable INTO v_col_type, v_is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'created_at';

    IF v_col_type IS DISTINCT FROM 'timestamp with time zone' THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.created_at must be TIMESTAMPTZ (timestamp with time zone), found %', v_col_type;
    END IF;

    IF v_is_nullable = 'YES' THEN
      UPDATE public.temporary_employee_id_cards SET created_at = NOW() WHERE created_at IS NULL;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN created_at SET NOT NULL;
    END IF;

    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN created_at SET DEFAULT NOW();
  END IF;

  -- ----------------------------------------------------------------------------
  -- Column 21: 'expires_at' (TIMESTAMPTZ, NOT NULL)
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours');
  ELSE
    SELECT data_type, is_nullable INTO v_col_type, v_is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'expires_at';

    IF v_col_type IS DISTINCT FROM 'timestamp with time zone' THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.expires_at must be TIMESTAMPTZ (timestamp with time zone), found %', v_col_type;
    END IF;

    IF v_is_nullable = 'YES' THEN
      UPDATE public.temporary_employee_id_cards
      SET expires_at = COALESCE(created_at, NOW()) + INTERVAL '24 hours'
      WHERE expires_at IS NULL;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN expires_at SET NOT NULL;
    END IF;

    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '24 hours');
  END IF;

  -- ----------------------------------------------------------------------------
  -- Column 22: 'deleted_at' (TIMESTAMPTZ, nullable)
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN deleted_at TIMESTAMPTZ;
  ELSE
    SELECT data_type INTO v_col_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'deleted_at';

    IF v_col_type IS DISTINCT FROM 'timestamp with time zone' THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.deleted_at must be TIMESTAMPTZ, found %', v_col_type;
    END IF;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Column 23: 'metadata' (JSONB, NOT NULL, DEFAULT '{}'::jsonb)
  -- ----------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.temporary_employee_id_cards ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  ELSE
    SELECT data_type, is_nullable INTO v_col_type, v_is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'temporary_employee_id_cards' AND column_name = 'metadata';

    IF v_col_type = 'json' THEN
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN metadata TYPE JSONB USING metadata::jsonb;
    ELSIF v_col_type IS DISTINCT FROM 'jsonb' THEN
      RAISE EXCEPTION 'Incompatible column type: temporary_employee_id_cards.metadata must be JSONB (or JSON), found %', v_col_type;
    END IF;

    IF v_is_nullable = 'YES' THEN
      UPDATE public.temporary_employee_id_cards SET metadata = '{}'::jsonb WHERE metadata IS NULL;
      ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN metadata SET NOT NULL;
    END IF;

    ALTER TABLE public.temporary_employee_id_cards ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
  END IF;

  -- ----------------------------------------------------------------------------
  -- Pre-Existing Data Referential Sanity Checks
  -- ----------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_corrupt_count
  FROM public.temporary_employee_id_cards t
  JOIN public.employees e ON e.id = t.employee_id
  WHERE e.company_id <> t.company_id;

  IF v_corrupt_count > 0 THEN
    RAISE EXCEPTION 'Safe migration aborted: temporary_employee_id_cards contains % rows with cross-company employee references.', v_corrupt_count;
  END IF;

  SELECT COUNT(*) INTO v_corrupt_count
  FROM public.temporary_employee_id_cards t
  LEFT JOIN public.companies c ON c.id = t.company_id
  WHERE c.id IS NULL;

  IF v_corrupt_count > 0 THEN
    RAISE EXCEPTION 'Safe migration aborted: temporary_employee_id_cards contains % rows referencing non-existent company_id.', v_corrupt_count;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Exact Positional Foreign Key Verification & Deduplication
-- Validates complete column mappings using positional ordering, preserving unrelated constraints.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_company_fk_count INTEGER := 0;
  v_emp_fk_count INTEGER := 0;
  v_user_fk_count INTEGER := 0;
BEGIN
  -- Inspect all foreign key constraints on public.temporary_employee_id_cards
  FOR r IN (
    SELECT
      c.conname AS constraint_name,
      c.confdeltype,
      fn.nspname AS ref_schema,
      f.relname AS ref_table,
      ARRAY(
        SELECT attname::text FROM pg_attribute
        WHERE attrelid = c.conrelid AND attnum = ANY(c.conkey)
        ORDER BY array_position(c.conkey, attnum)
      ) AS local_cols,
      ARRAY(
        SELECT attname::text FROM pg_attribute
        WHERE attrelid = c.confrelid AND attnum = ANY(c.confkey)
        ORDER BY array_position(c.confkey, attnum)
      ) AS ref_cols
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace tn ON tn.oid = t.relnamespace
    JOIN pg_class f ON f.oid = c.confrelid
    JOIN pg_namespace fn ON fn.oid = f.relnamespace
    WHERE tn.nspname = 'public'
      AND t.relname = 'temporary_employee_id_cards'
      AND c.contype = 'f'
  ) LOOP
    -- Reject unexpected composite foreign keys involving any of our columns
    IF array_length(r.local_cols, 1) > 1 AND (
      'company_id' = ANY(r.local_cols) OR
      'employee_id' = ANY(r.local_cols) OR
      'created_by' = ANY(r.local_cols)
    ) THEN
      RAISE EXCEPTION 'Schema ambiguity: unexpected composite foreign key "%" detected on columns % referencing %.%(%). Manual DBA review required.',
        r.constraint_name, r.local_cols, r.ref_schema, r.ref_table, r.ref_cols;
    END IF;

    -- Single-column foreign key on company_id
    IF r.local_cols = ARRAY['company_id'] THEN
      IF r.ref_schema <> 'public' OR r.ref_table <> 'companies' OR r.ref_cols <> ARRAY['id'] THEN
        RAISE EXCEPTION 'Foreign key violation: constraint "%" on company_id references %.%(%) instead of public.companies(id).',
          r.constraint_name, r.ref_schema, r.ref_table, r.ref_cols;
      END IF;

      IF r.constraint_name = 'fk_temporary_id_cards_company' AND r.confdeltype = 'r' THEN
        v_company_fk_count := v_company_fk_count + 1;
      ELSE
        EXECUTE format('ALTER TABLE public.temporary_employee_id_cards DROP CONSTRAINT %I', r.constraint_name);
      END IF;

    -- Single-column foreign key on employee_id
    ELSIF r.local_cols = ARRAY['employee_id'] THEN
      IF r.ref_schema <> 'public' OR r.ref_table <> 'employees' OR r.ref_cols <> ARRAY['id'] THEN
        RAISE EXCEPTION 'Foreign key violation: constraint "%" on employee_id references %.%(%) instead of public.employees(id).',
          r.constraint_name, r.ref_schema, r.ref_table, r.ref_cols;
      END IF;

      IF r.constraint_name = 'fk_temporary_id_cards_employee' AND r.confdeltype = 'n' THEN
        v_emp_fk_count := v_emp_fk_count + 1;
      ELSE
        EXECUTE format('ALTER TABLE public.temporary_employee_id_cards DROP CONSTRAINT %I', r.constraint_name);
      END IF;

    -- Single-column foreign key on created_by
    ELSIF r.local_cols = ARRAY['created_by'] THEN
      IF r.ref_schema <> 'public' OR r.ref_table <> 'users' OR r.ref_cols <> ARRAY['id'] THEN
        RAISE EXCEPTION 'Foreign key violation: constraint "%" on created_by references %.%(%) instead of public.users(id).',
          r.constraint_name, r.ref_schema, r.ref_table, r.ref_cols;
      END IF;

      IF r.constraint_name = 'fk_temporary_id_cards_created_by' AND r.confdeltype = 'n' THEN
        v_user_fk_count := v_user_fk_count + 1;
      ELSE
        EXECUTE format('ALTER TABLE public.temporary_employee_id_cards DROP CONSTRAINT %I', r.constraint_name);
      END IF;
    END IF;
  END LOOP;

  -- Ensure single canonical company foreign key exists (ON DELETE RESTRICT)
  IF v_company_fk_count = 0 THEN
    ALTER TABLE public.temporary_employee_id_cards
      ADD CONSTRAINT fk_temporary_id_cards_company
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
  END IF;

  -- Ensure single canonical employee foreign key exists (ON DELETE SET NULL)
  IF v_emp_fk_count = 0 THEN
    ALTER TABLE public.temporary_employee_id_cards
      ADD CONSTRAINT fk_temporary_id_cards_employee
      FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;

  -- Ensure single canonical created_by foreign key exists (ON DELETE SET NULL)
  IF v_user_fk_count = 0 THEN
    ALTER TABLE public.temporary_employee_id_cards
      ADD CONSTRAINT fk_temporary_id_cards_created_by
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Concurrency-Safe Cross-Company Employee Isolation Trigger
-- Uses SELECT ... FOR SHARE on public.employees to prevent race conditions during concurrent reassignments.
-- Preserves the immutable company snapshot of the card without altering public.employees.
--
-- LIFECYCLE NOTE ON SUBSEQUENT EMPLOYEE TRANSFERS:
-- A temporary ID card is designed as an immutable 24-hour point-in-time credential snapshot
-- bound to the issuing company and its dedicated Storage assets (/temporary-id-cards/{companyId}/{cardId}/).
-- If an employee is transferred to another company after card generation, the issued card remains
-- bound to the original issuing company for its remaining lifespan (< 24 hours), ensuring asset
-- paths remain synchronized and preventing cross-company asset leakage. Modifying public.employees
-- or introducing cascading triggers on employee transfers is deliberately avoided to keep HRMS
-- employee management modules strictly decoupled.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_temporary_card_employee_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_emp_company_id UUID;
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    -- Concurrency-safe lookup: FOR SHARE waits for any in-flight concurrent updates on the employee
    -- and locks the row in shared mode during validation without mutating public.employees.
    SELECT e.company_id INTO v_emp_company_id
    FROM public.employees e
    WHERE e.id = NEW.employee_id
    FOR SHARE;

    IF v_emp_company_id IS NULL THEN
      RAISE EXCEPTION 'Referential integrity violation: referenced employee % does not exist.', NEW.employee_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_emp_company_id <> NEW.company_id THEN
      RAISE EXCEPTION 'Cross-company violation: employee % belongs to company %, not card company %.',
        NEW.employee_id, v_emp_company_id, NEW.company_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_temporary_card_employee_company ON public.temporary_employee_id_cards;
CREATE TRIGGER trg_check_temporary_card_employee_company
  BEFORE INSERT OR UPDATE OF employee_id, company_id
  ON public.temporary_employee_id_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.check_temporary_card_employee_company();

-- ------------------------------------------------------------------------------
-- 5. Exact 24-Hour Expiration Lifecycle Trigger
-- - Database controls created_at unconditionally on INSERT (ignores client inputs).
-- - Database sets expires_at = created_at + INTERVAL '24 hours' on INSERT.
-- - Strictly prohibits modifying created_at after insertion.
-- - Strictly prohibits extending expires_at on UPDATE.
-- - Strictly prohibits setting expires_at to NULL.
-- - Preserves legitimate cleanup, soft-deletion, and hard-deletion operations.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_temporary_card_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Unconditionally override client-supplied timestamps
    NEW.created_at := clock_timestamp();
    NEW.expires_at := NEW.created_at + INTERVAL '24 hours';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Prohibit any direct or indirect alteration of created_at
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Illegal operation: created_at timestamp is immutable once created.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    -- Prohibit setting expires_at to NULL
    IF NEW.expires_at IS NULL THEN
      RAISE EXCEPTION 'Illegal operation: expires_at cannot be set to NULL.'
        USING ERRCODE = 'not_null_violation';
    END IF;

    -- Strictly prohibit extending the expiration lifetime
    IF NEW.expires_at > OLD.expires_at THEN
      RAISE EXCEPTION 'Illegal operation: temporary ID card expiration lifetime cannot be extended.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_temporary_card_lifecycle ON public.temporary_employee_id_cards;
CREATE TRIGGER trg_enforce_temporary_card_lifecycle
  BEFORE INSERT OR UPDATE
  ON public.temporary_employee_id_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_temporary_card_lifecycle();

-- ------------------------------------------------------------------------------
-- 6. Performance & Audit Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_temp_id_cards_company_id ON public.temporary_employee_id_cards(company_id);
CREATE INDEX IF NOT EXISTS idx_temp_id_cards_expires_at ON public.temporary_employee_id_cards(expires_at);
CREATE INDEX IF NOT EXISTS idx_temp_id_cards_employee_id ON public.temporary_employee_id_cards(employee_id);
CREATE INDEX IF NOT EXISTS idx_temp_id_cards_active ON public.temporary_employee_id_cards(company_id, expires_at) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------------------------
-- 7. Fail-Closed Non-Recursive RLS Helper Function
-- Fails closed on anonymous callers, mismatched user IDs, or unauthorized roles.
-- search_path is strictly locked to pg_catalog, pg_temp.
-- Resolves authorization without RLS recursion.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_id_card_admin(
  p_company_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
BEGIN
  -- 1. Reject NULL company ID immediately
  IF p_company_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 2. Read caller role and caller auth UID
  v_role := auth.role();
  v_caller_id := auth.uid();

  -- 3. Service role is unconditionally permitted without requiring a non-NULL user ID
  IF v_role = 'service_role' THEN
    RETURN TRUE;
  END IF;

  -- 4. Otherwise, reject NULL caller/user IDs and require auth.uid() = p_user_id
  IF v_caller_id IS NULL OR p_user_id IS NULL OR v_caller_id <> p_user_id THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE u.id = p_user_id
      AND u.company_id = p_company_id
      AND r.company_id = u.company_id
      AND r.name IN ('SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION')
      AND u.is_active = TRUE
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. Fail-Closed Function Ownership Verification & Security Assertions
-- Verifies exact signatures, actual owners, schema privileges, table privileges, and RLS behavior.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_admin_oid oid;
  v_emp_oid oid;
  v_life_oid oid;
  v_admin_owner text;
  v_emp_owner text;
  v_life_owner text;
  v_admin_secdef boolean;
  v_emp_secdef boolean;
  v_life_secdef boolean;
  v_rls_on_employees boolean := FALSE;
  v_rls_on_auth_tables boolean := FALSE;
  v_emp_owner_bypasses_rls boolean := FALSE;
  v_admin_owner_bypasses_rls boolean := FALSE;
BEGIN
  -- 1. Identify functions by exact signature
  BEGIN
    v_admin_oid := 'public.is_id_card_admin(uuid, uuid)'::regprocedure::oid;
    v_emp_oid := 'public.check_temporary_card_employee_company()'::regprocedure::oid;
    v_life_oid := 'public.enforce_temporary_card_lifecycle()'::regprocedure::oid;
  EXCEPTION
    WHEN undefined_function THEN
      RAISE EXCEPTION 'Security assertion failed: One or more ID-card functions do not exist with the expected exact signature.';
  END;

  -- 2. Inspect actual function owners and SECURITY DEFINER declarations
  SELECT pg_get_userbyid(proowner), prosecdef INTO v_admin_owner, v_admin_secdef
  FROM pg_proc WHERE oid = v_admin_oid;

  SELECT pg_get_userbyid(proowner), prosecdef INTO v_emp_owner, v_emp_secdef
  FROM pg_proc WHERE oid = v_emp_oid;

  SELECT pg_get_userbyid(proowner), prosecdef INTO v_life_owner, v_life_secdef
  FROM pg_proc WHERE oid = v_life_oid;

  IF NOT (v_admin_secdef AND v_emp_secdef AND v_life_secdef) THEN
    RAISE EXCEPTION 'Security assertion failed: All three functions must be declared SECURITY DEFINER.';
  END IF;

  -- 3. Verify USAGE on schema public for all function owners
  IF NOT has_schema_privilege(v_admin_owner, 'public', 'USAGE') THEN
    RAISE EXCEPTION 'Security assertion failed: Owner of is_id_card_admin(uuid, uuid) ("%") lacks USAGE on schema public.', v_admin_owner;
  END IF;
  IF NOT has_schema_privilege(v_emp_owner, 'public', 'USAGE') THEN
    RAISE EXCEPTION 'Security assertion failed: Owner of check_temporary_card_employee_company() ("%") lacks USAGE on schema public.', v_emp_owner;
  END IF;
  IF NOT has_schema_privilege(v_life_owner, 'public', 'USAGE') THEN
    RAISE EXCEPTION 'Security assertion failed: Owner of enforce_temporary_card_lifecycle() ("%") lacks USAGE on schema public.', v_life_owner;
  END IF;

  -- 4. Verify table privileges for is_id_card_admin(uuid, uuid) owner
  IF NOT (
    has_table_privilege(v_admin_owner, 'public.users', 'SELECT') AND
    has_table_privilege(v_admin_owner, 'public.user_roles', 'SELECT') AND
    has_table_privilege(v_admin_owner, 'public.roles', 'SELECT')
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: Owner of is_id_card_admin(uuid, uuid) ("%") lacks SELECT privilege on public.users, public.user_roles, or public.roles.', v_admin_owner;
  END IF;

  -- 5. Verify table privilege for check_temporary_card_employee_company() owner
  IF NOT has_table_privilege(v_emp_owner, 'public.employees', 'SELECT') THEN
    RAISE EXCEPTION 'Security assertion failed: Owner of check_temporary_card_employee_company() ("%") lacks SELECT privilege on public.employees.', v_emp_owner;
  END IF;

  -- 6. Verify RLS behavior for check_temporary_card_employee_company reading employees
  SELECT COALESCE(c.relrowsecurity, FALSE) INTO v_rls_on_employees
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'employees';

  IF v_rls_on_employees THEN
    -- If employees has RLS active, verify owner has BYPASSRLS or superuser privilege
    SELECT (r.rolbypassrls OR r.rolsuper) INTO v_emp_owner_bypasses_rls
    FROM pg_roles r
    WHERE r.rolname = v_emp_owner;

    IF NOT COALESCE(v_emp_owner_bypasses_rls, FALSE) THEN
      RAISE EXCEPTION 'Security assertion failed: public.employees has RLS active, but owner "%" of check_temporary_card_employee_company() lacks BYPASSRLS or superuser privilege. Cross-company employee validation cannot execute reliably.', v_emp_owner;
    END IF;
  END IF;

  -- 7. Verify RLS behavior for is_id_card_admin reading users, user_roles, roles
  SELECT bool_or(c.relrowsecurity) INTO v_rls_on_auth_tables
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('users', 'user_roles', 'roles');

  IF COALESCE(v_rls_on_auth_tables, FALSE) THEN
    SELECT (r.rolbypassrls OR r.rolsuper) INTO v_admin_owner_bypasses_rls
    FROM pg_roles r
    WHERE r.rolname = v_admin_owner;

    IF NOT COALESCE(v_admin_owner_bypasses_rls, FALSE) THEN
      RAISE EXCEPTION 'Security assertion failed: RLS is active on public.users/user_roles/roles, but owner "%" of is_id_card_admin(uuid, uuid) lacks BYPASSRLS or superuser privilege.', v_admin_owner;
    END IF;
  END IF;
END $$;

-- Revoke execution from PUBLIC and anon
REVOKE ALL ON FUNCTION public.is_id_card_admin(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_temporary_card_employee_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_temporary_card_lifecycle() FROM PUBLIC, anon, authenticated;

-- Grant execution strictly to authorized callers
GRANT EXECUTE ON FUNCTION public.is_id_card_admin(UUID, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. Table-Level Grants (Separated from RLS)
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.temporary_employee_id_cards FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.temporary_employee_id_cards TO authenticated;
GRANT ALL ON TABLE public.temporary_employee_id_cards TO service_role;

-- ------------------------------------------------------------------------------
-- 10. Row Level Security (RLS) Configuration with Safe Legacy Purge
-- ------------------------------------------------------------------------------
ALTER TABLE public.temporary_employee_id_cards ENABLE ROW LEVEL SECURITY;

-- Safely purge ALL existing policies on temporary_employee_id_cards ONLY.
-- Does not affect any other table or module in the database.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'temporary_employee_id_cards'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.temporary_employee_id_cards', pol.policyname);
  END LOOP;
END $$;

-- 1. SELECT policy: Restricted strictly to authorized company admins
CREATE POLICY "temporary_id_cards_select_admin"
  ON public.temporary_employee_id_cards
  FOR SELECT
  TO authenticated
  USING (
    public.is_id_card_admin(temporary_employee_id_cards.company_id, auth.uid())
  );

-- 2. INSERT policy: Strict WITH CHECK ensuring card belongs to caller's company
CREATE POLICY "temporary_id_cards_insert_admin"
  ON public.temporary_employee_id_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_id_card_admin(temporary_employee_id_cards.company_id, auth.uid())
  );

-- 3. UPDATE policy: Explicit USING and WITH CHECK
CREATE POLICY "temporary_id_cards_update_admin"
  ON public.temporary_employee_id_cards
  FOR UPDATE
  TO authenticated
  USING (
    public.is_id_card_admin(temporary_employee_id_cards.company_id, auth.uid())
  )
  WITH CHECK (
    public.is_id_card_admin(temporary_employee_id_cards.company_id, auth.uid())
  );

-- 4. DELETE policy: Explicit USING restricted to authorized company admins
CREATE POLICY "temporary_id_cards_delete_admin"
  ON public.temporary_employee_id_cards
  FOR DELETE
  TO authenticated
  USING (
    public.is_id_card_admin(temporary_employee_id_cards.company_id, auth.uid())
  );
