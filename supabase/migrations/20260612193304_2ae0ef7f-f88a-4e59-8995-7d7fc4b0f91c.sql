
-- 1) Restrict contract_templates SELECT to HR admins and dept managers
DROP POLICY IF EXISTS "All authenticated can read templates" ON public.contract_templates;
CREATE POLICY "HR and managers read templates" ON public.contract_templates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin') OR public.has_role(auth.uid(), 'dept_manager'));

-- 2) Restrict employee UPDATE on contracts to signing only (status/signed_at)
CREATE OR REPLACE FUNCTION public.enforce_contract_employee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT e.user_id INTO v_owner FROM public.employees e WHERE e.id = NEW.employee_id;
  IF auth.uid() IS NOT NULL
     AND auth.uid() = v_owner
     AND NOT public.has_role(auth.uid(), 'hr_admin')
  THEN
    IF NEW.title       IS DISTINCT FROM OLD.title
       OR NEW.body        IS DISTINCT FROM OLD.body
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.data        IS DISTINCT FROM OLD.data
       OR NEW.pdf_url     IS DISTINCT FROM OLD.pdf_url
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.sent_at     IS DISTINCT FROM OLD.sent_at
    THEN
      RAISE EXCEPTION 'Employees may only sign their contracts';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'signed' THEN
      RAISE EXCEPTION 'Employees may only set contract status to signed';
    END IF;
    IF OLD.status <> 'sent' AND NEW.status = 'signed' THEN
      RAISE EXCEPTION 'Only sent contracts can be signed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_contracts_enforce_employee_update ON public.contracts;
CREATE TRIGGER trg_contracts_enforce_employee_update
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contract_employee_update();

-- 3) Explicit DELETE restriction on contracts storage bucket (HR only)
DROP POLICY IF EXISTS "Only HR deletes contract files" ON storage.objects;
CREATE POLICY "Only HR deletes contract files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contracts' AND public.has_role(auth.uid(), 'hr_admin'));

-- 4) Harden internal email helper functions: fixed search_path + revoke from clients
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
