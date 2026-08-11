
-- Document categories enum
DO $$ BEGIN
  CREATE TYPE public.document_category AS ENUM (
    'national_id', 'passport', 'iqama', 'driver_license',
    'qualification', 'certificate', 'cv', 'contract_copy',
    'medical', 'insurance', 'training', 'work_permit', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  category public.document_category NOT NULL DEFAULT 'other',
  title text NOT NULL,
  document_number text,
  issue_date date,
  expiry_date date,
  issuing_authority text,
  notes text,
  storage_path text NOT NULL,
  file_size integer,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON public.employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_expiry ON public.employee_documents(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_documents_category ON public.employee_documents(category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

-- HR admin: full access
CREATE POLICY "hr_admin_all_documents" ON public.employee_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));

-- Employee: read/insert/update own documents
CREATE POLICY "employee_read_own_documents" ON public.employee_documents
  FOR SELECT TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "employee_insert_own_documents" ON public.employee_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "employee_update_own_documents" ON public.employee_documents
  FOR UPDATE TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "employee_delete_own_documents" ON public.employee_documents
  FOR DELETE TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- Department manager: read documents of their department's employees
CREATE POLICY "dept_manager_read_documents" ON public.employee_documents
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'dept_manager')
    AND employee_id IN (
      SELECT e.id FROM public.employees e
      JOIN public.departments d ON d.id = e.department_id
      WHERE d.manager_id = auth.uid()
    )
  );

CREATE TRIGGER update_employee_documents_updated_at
  BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage RLS for documents bucket (bucket created via tool separately)
CREATE POLICY "documents_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'hr_admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "documents_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'hr_admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "documents_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'hr_admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "documents_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'hr_admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );
