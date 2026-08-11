
-- 1) Schema additions (idempotent)
ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS jurisdiction text NOT NULL DEFAULT 'ksa',
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS contract_type text NOT NULL DEFAULT 'employment',
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_templates_jurisdiction_chk') THEN
    ALTER TABLE public.contract_templates
      ADD CONSTRAINT contract_templates_jurisdiction_chk
      CHECK (jurisdiction IN ('global','mena','gcc','ksa'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_templates_department_chk') THEN
    ALTER TABLE public.contract_templates
      ADD CONSTRAINT contract_templates_department_chk
      CHECK (department IN ('tech','marketing','consulting_finance','consulting_admin','consulting_legal','hr','general'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_templates_type_chk') THEN
    ALTER TABLE public.contract_templates
      ADD CONSTRAINT contract_templates_type_chk
      CHECK (contract_type IN ('employment','nda_unilateral','nda_mutual','consulting','salary_amendment','termination'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_templates_language_chk') THEN
    ALTER TABLE public.contract_templates
      ADD CONSTRAINT contract_templates_language_chk
      CHECK (language IN ('ar','en','bilingual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_templates_filter
  ON public.contract_templates (jurisdiction, department, contract_type, is_active);

-- 2) Backfill classification on the existing official templates (by name)
UPDATE public.contract_templates SET jurisdiction='ksa', department='tech',       contract_type='employment',     language='ar', tags=ARRAY['IP','عدم منافسة','محدد المدة']
  WHERE name='عقد عمل سعودي — موظف تقنية (محدد المدة)';
UPDATE public.contract_templates SET jurisdiction='ksa', department='marketing',  contract_type='employment',     language='ar', tags=ARRAY['حقوق الصورة','KPIs']
  WHERE name='عقد عمل — موظف تسويق';
UPDATE public.contract_templates SET jurisdiction='ksa', department='consulting_finance', contract_type='consulting', language='ar', tags=ARRAY['SOCPA','مسؤولية مهنية']
  WHERE name='عقد استشاري (مالي/إداري/قانوني)';
UPDATE public.contract_templates SET jurisdiction='ksa', department='general',    contract_type='nda_unilateral', language='ar', tags=ARRAY['3 سنوات']
  WHERE name='اتفاقية عدم إفصاح (NDA) — أحادية الطرف';
UPDATE public.contract_templates SET jurisdiction='ksa', department='general',    contract_type='nda_mutual',     language='ar', tags=ARRAY['SCCA','تحكيم']
  WHERE name='اتفاقية عدم إفصاح متبادلة (Mutual NDA)';

-- 3) Insert new professional templates
-- ============ GLOBAL ============

INSERT INTO public.contract_templates (name, description, jurisdiction, department, contract_type, language, tags, body, variables) VALUES
('Global Employment Agreement — Tech',
 'International tech employment with IP assignment, confidentiality and remote-work clauses (English).',
 'global','tech','employment','en',
 ARRAY['IP Assignment','Remote','At-will'],
$body$<h2>EMPLOYMENT AGREEMENT</h2>
<p>This Employment Agreement (the "Agreement") is made on {{date}} between <b>{{company_name}}</b> ("Company"), and <b>{{employee_name}}</b>, passport/ID No. {{employee_id_no}} ("Employee").</p>
<h3>1. Position & Duties</h3>
<p>Employee shall serve as <b>{{job_title}}</b>, reporting to {{reports_to}}, and perform duties consistent with this role.</p>
<h3>2. Term & Location</h3>
<p>Start date: {{start_date}}. Work location: {{work_location}} (remote/hybrid permitted as agreed).</p>
<h3>3. Compensation</h3>
<p>Annual gross salary: <b>{{annual_salary}} {{currency}}</b>, paid in equal monthly installments, plus benefits per Company policy.</p>
<h3>4. Intellectual Property</h3>
<p>All inventions, code, designs, and works made within the scope of employment are "works made for hire" and assigned exclusively to the Company.</p>
<h3>5. Confidentiality</h3>
<p>Employee shall not disclose Confidential Information during and for {{confidentiality_years}} years after termination.</p>
<h3>6. Non-Solicitation</h3>
<p>For {{non_solicit_months}} months post-termination, Employee shall not solicit Company employees or clients.</p>
<h3>7. Termination</h3>
<p>Either party may terminate with {{notice_days}} days written notice. Summary dismissal for cause permitted.</p>
<h3>8. Governing Law & Dispute Resolution</h3>
<p>This Agreement is governed by the laws of {{governing_law}}. Disputes shall be resolved by arbitration under {{arbitration_rules}}.</p>
<p>Signed: ____________________  Date: {{date}}</p>$body$,
 to_jsonb(ARRAY['company_name','employee_name','employee_id_no','job_title','reports_to','start_date','work_location','annual_salary','currency','confidentiality_years','non_solicit_months','notice_days','governing_law','arbitration_rules','date'])),

('Global Mutual NDA — IP Heavy',
 'Cross-border mutual NDA suited to tech partnerships and joint development.',
 'global','tech','nda_mutual','en',
 ARRAY['Mutual','IP','Cross-border'],
$body$<h2>MUTUAL NON-DISCLOSURE AGREEMENT</h2>
<p>Between <b>{{party_a}}</b> and <b>{{party_b}}</b>, effective {{effective_date}}.</p>
<h3>1. Purpose</h3>
<p>Evaluation of a potential collaboration concerning {{purpose}}.</p>
<h3>2. Confidential Information</h3>
<p>Any non-public technical, business or financial information disclosed in any form, including source code, designs, and roadmaps.</p>
<h3>3. Obligations</h3>
<p>Each party shall (a) protect the other's Confidential Information with no less than reasonable care, (b) use it solely for the Purpose, and (c) limit access to personnel with a need to know.</p>
<h3>4. Term</h3>
<p>This Agreement remains in force for {{term_years}} years from the Effective Date; confidentiality obligations survive for {{survival_years}} years thereafter.</p>
<h3>5. No License</h3>
<p>No license or right under any IP is granted except as expressly stated.</p>
<h3>6. Governing Law</h3>
<p>{{governing_law}}. Disputes resolved by arbitration under {{arbitration_rules}}, seat {{seat}}.</p>
<p>Authorized signatures of both parties below.</p>$body$,
 to_jsonb(ARRAY['party_a','party_b','effective_date','purpose','term_years','survival_years','governing_law','arbitration_rules','seat'])),

('Global Consulting / SOW Agreement',
 'Independent consulting agreement with deliverables, SOW and liability cap.',
 'global','consulting_admin','consulting','en',
 ARRAY['SOW','Deliverables','Liability cap'],
$body$<h2>CONSULTING AGREEMENT</h2>
<p>Between <b>{{client_name}}</b> ("Client") and <b>{{consultant_name}}</b> ("Consultant"), dated {{date}}.</p>
<h3>1. Services</h3>
<p>Consultant shall provide the services described in Statement of Work #{{sow_number}}: {{services_summary}}.</p>
<h3>2. Fees & Expenses</h3>
<p>Fees: {{fee_amount}} {{currency}} {{fee_basis}}. Pre-approved expenses reimbursed at cost. Invoices due within {{payment_days}} days.</p>
<h3>3. Independent Contractor</h3>
<p>Consultant is an independent contractor; nothing herein creates an employment, partnership or agency relationship.</p>
<h3>4. IP Ownership</h3>
<p>Deliverables created specifically for Client are assigned to Client upon full payment. Consultant retains pre-existing materials and grants Client a perpetual license to use them as embedded in Deliverables.</p>
<h3>5. Warranty & Liability</h3>
<p>Each party's aggregate liability under this Agreement is limited to fees paid in the preceding 12 months. No indirect or consequential damages.</p>
<h3>6. Term & Termination</h3>
<p>Term runs through {{end_date}}. Either party may terminate for convenience on {{notice_days}} days notice.</p>
<h3>7. Governing Law</h3>
<p>{{governing_law}}.</p>$body$,
 to_jsonb(ARRAY['client_name','consultant_name','date','sow_number','services_summary','fee_amount','currency','fee_basis','payment_days','end_date','notice_days','governing_law'])),

('Global Marketing Services Agreement',
 'Marketing agency-style contract with content ownership and KPI clauses.',
 'global','marketing','consulting','en',
 ARRAY['Content Rights','KPIs','Image Rights'],
$body$<h2>MARKETING SERVICES AGREEMENT</h2>
<p>Between <b>{{client_name}}</b> and <b>{{agency_name}}</b>, dated {{date}}.</p>
<h3>1. Scope of Services</h3>
<p>Agency shall plan and execute the marketing program described in Exhibit A, including: {{services_summary}}.</p>
<h3>2. KPIs & Reporting</h3>
<p>Monthly KPIs: {{kpis}}. Agency shall deliver a monthly performance report by the 5th of each month.</p>
<h3>3. Content & Image Rights</h3>
<p>All campaign content, creatives and copy produced for Client are assigned to Client upon payment. Talent and image rights cleared by Agency are licensed to Client for {{image_rights_years}} years in {{territory}}.</p>
<h3>4. Fees</h3>
<p>Retainer {{retainer_amount}} {{currency}} per month, plus media spend billed at cost + {{media_markup}}%.</p>
<h3>5. Non-Solicitation</h3>
<p>For {{non_solicit_months}} months post-termination, neither party shall solicit the other's personnel.</p>
<h3>6. Term</h3>
<p>Initial term {{initial_months}} months; auto-renews unless either party gives {{notice_days}} days notice.</p>
<h3>7. Governing Law</h3>
<p>{{governing_law}}.</p>$body$,
 to_jsonb(ARRAY['client_name','agency_name','date','services_summary','kpis','image_rights_years','territory','retainer_amount','currency','media_markup','non_solicit_months','initial_months','notice_days','governing_law'])),

-- ============ MENA ============

('عقد توظيف إقليمي — تقنية (شرق أوسط)',
 'عقد توظيف تقني مرن مناسب لدول الشرق الأوسط مع نقل ملكية فكرية وعدم منافسة.',
 'mena','tech','employment','ar',
 ARRAY['IP','عدم منافسة','مرن'],
$body$<h2>عقد عمل — قسم التقنية</h2>
<p>أُبرم هذا العقد في {{date}} بين <b>{{company_name}}</b> (الطرف الأول) و<b>{{employee_name}}</b>، حامل/ة الهوية رقم {{employee_id_no}} (الطرف الثاني).</p>
<h3>١) المسمى والمهام</h3>
<p>يعمل الطرف الثاني بمسمى <b>{{job_title}}</b> ويتبع إدارياً لـ {{reports_to}}.</p>
<h3>٢) المدة والمكان</h3>
<p>مدة العقد {{contract_duration}}، تبدأ في {{start_date}}، مقر العمل: {{work_location}} مع إمكانية العمل عن بُعد بحسب سياسة الشركة.</p>
<h3>٣) الأجر</h3>
<p>الراتب الأساسي الشهري: <b>{{base_salary}} {{currency}}</b>، بدلات: {{allowances}}.</p>
<h3>٤) الملكية الفكرية</h3>
<p>تنتقل ملكية جميع الأكواد والاختراعات والأعمال المنجزة ضمن نطاق العمل ملكية حصرية للطرف الأول.</p>
<h3>٥) السرية</h3>
<p>يلتزم الطرف الثاني بالسرية أثناء العقد ولمدة {{confidentiality_years}} سنوات بعد انتهائه.</p>
<h3>٦) عدم المنافسة</h3>
<p>لمدة {{non_compete_months}} شهراً بعد انتهاء العقد ضمن نطاق جغرافي {{non_compete_area}}.</p>
<h3>٧) الإنهاء</h3>
<p>بإشعار خطي مدته {{notice_days}} يوماً، ويحق الإنهاء الفوري للسبب المشروع.</p>
<h3>٨) القانون المُطبَّق</h3>
<p>تخضع أحكام هذا العقد لقوانين {{country}}.</p>$body$,
 to_jsonb(ARRAY['company_name','employee_name','employee_id_no','job_title','reports_to','contract_duration','start_date','work_location','base_salary','currency','allowances','confidentiality_years','non_compete_months','non_compete_area','notice_days','country','date'])),

('NDA أحادي — موظف (شرق أوسط)',
 'اتفاقية سرية للموظفين الجدد بصياغة عربية مرنة لدول المنطقة.',
 'mena','general','nda_unilateral','ar',
 ARRAY['موظف جديد','3 سنوات'],
$body$<h2>اتفاقية عدم إفصاح أحادية الطرف</h2>
<p>أُبرمت في {{date}} بين <b>{{company_name}}</b> (الجهة المُفصِحة) و<b>{{recipient_name}}</b> (المستلم).</p>
<h3>١) المعلومات السرية</h3>
<p>تشمل كل المعلومات التقنية والمالية والتجارية وقوائم العملاء والأسرار التجارية التي يطّلع عليها المستلم بحكم عمله.</p>
<h3>٢) الالتزامات</h3>
<p>يلتزم المستلم بالحفاظ على سرية المعلومات وعدم استخدامها لأي غرض خارج نطاق عمله، أثناء العقد ولمدة <b>{{survival_years}}</b> سنوات بعد انتهائه.</p>
<h3>٣) الإعادة والإتلاف</h3>
<p>يلتزم المستلم بإعادة أو إتلاف جميع المواد السرية فور انتهاء العلاقة.</p>
<h3>٤) القانون</h3>
<p>{{governing_law}}.</p>$body$,
 to_jsonb(ARRAY['company_name','recipient_name','survival_years','governing_law','date'])),

('عقد استشارات إدارية إقليمي',
 'عقد للمستشار الإداري للمنطقة العربية مع نطاق عمل واضح وسقف للمسؤولية.',
 'mena','consulting_admin','consulting','ar',
 ARRAY['نطاق عمل','سقف مسؤولية'],
$body$<h2>عقد تقديم خدمات استشارية إدارية</h2>
<p>بين <b>{{client_name}}</b> (العميل) و<b>{{consultant_name}}</b> (المستشار)، بتاريخ {{date}}.</p>
<h3>١) نطاق العمل</h3>
<p>{{scope_summary}} وفقاً لخطة العمل المرفقة.</p>
<h3>٢) المقابل المالي</h3>
<p>{{fee_amount}} {{currency}} يُستحقّ {{fee_basis}}، مع سداد خلال {{payment_days}} يوماً من الفاتورة.</p>
<h3>٣) التزامات المستشار</h3>
<p>تقديم الخدمات بالمعايير المهنية المعتمدة، والحفاظ على سرية معلومات العميل.</p>
<h3>٤) الملكية الفكرية</h3>
<p>تنتقل ملكية المخرجات للعميل عند سداد المقابل كاملاً.</p>
<h3>٥) سقف المسؤولية</h3>
<p>الحد الأقصى لمسؤولية المستشار يعادل قيمة الأتعاب المدفوعة خلال آخر ١٢ شهراً.</p>
<h3>٦) المدة والإنهاء</h3>
<p>المدة {{duration_months}} شهراً، ويحق لأي طرف الإنهاء بإشعار {{notice_days}} يوماً.</p>$body$,
 to_jsonb(ARRAY['client_name','consultant_name','date','scope_summary','fee_amount','currency','fee_basis','payment_days','duration_months','notice_days'])),

-- ============ GCC ============

('عقد توظيف خليجي عام',
 'قالب توظيف لدول مجلس التعاون الخليجي يحيل لقانون العمل المحلي للدولة المضيفة.',
 'gcc','general','employment','ar',
 ARRAY['GCC','قانون محلي'],
$body$<h2>عقد عمل — دول مجلس التعاون</h2>
<p>أُبرم هذا العقد في {{date}} بين <b>{{company_name}}</b> (صاحب العمل) و<b>{{employee_name}}</b> (العامل) جنسية {{nationality}}.</p>
<h3>١) المسمى وجهة العمل</h3>
<p>المسمى الوظيفي: <b>{{job_title}}</b>، مقر العمل: {{work_location}} بدولة {{host_country}}.</p>
<h3>٢) المدة</h3>
<p>{{contract_duration}}، تبدأ من {{start_date}} مع فترة تجربة {{probation_months}} أشهر.</p>
<h3>٣) الأجر والبدلات</h3>
<p>الراتب الأساسي {{base_salary}} {{currency}} شهرياً، بدل سكن {{housing}}، بدل مواصلات {{transport}}.</p>
<h3>٤) ساعات العمل والإجازات</h3>
<p>وفق قانون العمل المعمول به في {{host_country}}.</p>
<h3>٥) مكافأة نهاية الخدمة</h3>
<p>وفق قانون العمل في {{host_country}}.</p>
<h3>٦) السرية والملكية الفكرية</h3>
<p>كل ما يُنتجه العامل ضمن نطاق العمل مملوك لصاحب العمل، ويلتزم بسرية المعلومات أثناء العقد وبعده.</p>
<h3>٧) القانون المُطبَّق وتسوية النزاعات</h3>
<p>يخضع لقانون العمل في {{host_country}}، وتختص بنظر النزاعات المحاكم العمالية المختصة.</p>$body$,
 to_jsonb(ARRAY['company_name','employee_name','nationality','job_title','work_location','host_country','contract_duration','start_date','probation_months','base_salary','currency','housing','transport','date'])),

('NDA متبادل — شراكات خليجية (تحكيم DIFC/ADGM)',
 'اتفاقية سرية متبادلة للشراكات الخليجية مع تحكيم DIFC أو ADGM.',
 'gcc','general','nda_mutual','ar',
 ARRAY['DIFC','ADGM','شراكات'],
$body$<h2>اتفاقية عدم إفصاح متبادلة</h2>
<p>بين <b>{{party_a}}</b> و<b>{{party_b}}</b>، بتاريخ {{effective_date}}.</p>
<h3>١) الغرض</h3>
<p>تقييم فرصة شراكة تتعلق بـ {{purpose}}.</p>
<h3>٢) السرية</h3>
<p>يلتزم كل طرف بحماية المعلومات السرية للطرف الآخر بنفس قدر العناية الذي يبذله لمعلوماته، وقصر استخدامها على الغرض.</p>
<h3>٣) المدة</h3>
<p>سارية {{term_years}} سنوات، ويستمر التزام السرية لمدة {{survival_years}} سنوات بعدها.</p>
<h3>٤) التحكيم</h3>
<p>أي نزاع يُحلّ بالتحكيم وفق قواعد {{arbitration_center}} (DIFC-LCIA أو ADGM)، مقعد التحكيم {{seat}}، اللغة {{language}}.</p>$body$,
 to_jsonb(ARRAY['party_a','party_b','effective_date','purpose','term_years','survival_years','arbitration_center','seat','language'])),

('عقد استشارات مالية خليجي',
 'مستشار مالي خليجي وفق معايير الهيئات المهنية المعتمدة في الدولة المضيفة.',
 'gcc','consulting_finance','consulting','ar',
 ARRAY['مالية','هيئة مهنية'],
$body$<h2>عقد تقديم استشارات مالية</h2>
<p>بين <b>{{client_name}}</b> و<b>{{consultant_name}}</b> (مسجل لدى {{professional_body}})، بتاريخ {{date}}.</p>
<h3>١) نطاق الخدمات</h3>
<p>{{services_summary}}، وفقاً لمعايير المحاسبة والتدقيق المعتمدة في {{host_country}}.</p>
<h3>٢) الأتعاب</h3>
<p>{{fee_amount}} {{currency}} تُسدد {{fee_basis}}.</p>
<h3>٣) السرية والاستقلالية</h3>
<p>التزام تام بسرية بيانات العميل واستقلالية الرأي المهني.</p>
<h3>٤) المسؤولية المهنية</h3>
<p>الحد الأقصى لمسؤولية المستشار يعادل قيمة الأتعاب المدفوعة خلال السنة المالية الجارية.</p>
<h3>٥) القانون المُطبَّق</h3>
<p>قوانين {{host_country}}.</p>$body$,
 to_jsonb(ARRAY['client_name','consultant_name','professional_body','date','services_summary','host_country','fee_amount','currency','fee_basis'])),

-- ============ KSA (additions) ============

('عقد عمل سعودي — غير محدد المدة (إداري)',
 'عقد عمل سعودي غير محدد المدة لقسم الإدارة وفق نظام العمل ولوائحه.',
 'ksa','consulting_admin','employment','ar',
 ARRAY['غير محدد','إداري','نظام العمل'],
$body$<h2>عقد عمل — غير محدد المدة</h2>
<p>أُبرم في مدينة {{city}} بتاريخ {{date}}، بين <b>{{company_name}}</b>، سجل تجاري {{company_cr}} (صاحب العمل)، و<b>{{employee_name}}</b>، هوية رقم {{employee_id_no}} (العامل).</p>
<h3>١) المسمى الوظيفي</h3>
<p>{{job_title}}، يتبع لإدارة {{department_name}}، ويباشر العمل في {{start_date}}.</p>
<h3>٢) مدة العقد</h3>
<p>غير محدد المدة، مع فترة تجربة {{probation_months}} أشهر وفق المادة (53) من نظام العمل.</p>
<h3>٣) الأجر</h3>
<p>الراتب الأساسي {{base_salary}} ريال شهرياً، بدلات: {{allowances}}.</p>
<h3>٤) ساعات العمل والإجازات</h3>
<p>وفق المواد (98–119) من نظام العمل السعودي.</p>
<h3>٥) السرية</h3>
<p>يلتزم العامل بسرية المعلومات أثناء العقد ولمدة سنتين بعد انتهائه.</p>
<h3>٦) الإنهاء</h3>
<p>وفق المواد (74–77) من نظام العمل، بإشعار خطي مدته {{notice_days}} يوماً.</p>
<h3>٧) مكافأة نهاية الخدمة</h3>
<p>وفق المادة (84) من نظام العمل.</p>
<h3>٨) الاختصاص</h3>
<p>المحاكم العمالية بالمملكة العربية السعودية.</p>$body$,
 to_jsonb(ARRAY['city','date','company_name','company_cr','employee_name','employee_id_no','job_title','department_name','start_date','probation_months','base_salary','allowances','notice_days'])),

('عقد استشارات قانونية سعودي',
 'لاستشاري قانوني مرخّص من هيئة المحامين السعودية مع سقف مسؤولية وتعارض مصالح.',
 'ksa','consulting_legal','consulting','ar',
 ARRAY['هيئة المحامين','تعارض مصالح'],
$body$<h2>عقد تقديم استشارات قانونية</h2>
<p>بين <b>{{client_name}}</b> (العميل) و<b>{{lawyer_name}}</b>، رخصة هيئة المحامين رقم {{bar_license_no}} (المستشار)، بتاريخ {{date}}.</p>
<h3>١) نطاق الخدمات</h3>
<p>{{services_summary}}.</p>
<h3>٢) الأتعاب</h3>
<p>{{fee_amount}} ريال سعودي تُسدد {{fee_basis}}، إضافة إلى المصاريف الفعلية المعتمدة مسبقاً.</p>
<h3>٣) السرية</h3>
<p>التزام تام بأسرار العميل وفق نظام المحاماة ولائحته التنفيذية.</p>
<h3>٤) تعارض المصالح</h3>
<p>يقرّ المستشار بعدم وجود أي تعارض مصالح، ويلتزم بالإفصاح الفوري عند نشوء أي تعارض مستقبلاً.</p>
<h3>٥) سقف المسؤولية</h3>
<p>الحد الأقصى يعادل قيمة الأتعاب المدفوعة خلال آخر ١٢ شهراً، باستثناء الإهمال الجسيم.</p>
<h3>٦) الإنهاء</h3>
<p>يحق لأي طرف الإنهاء بإشعار {{notice_days}} يوماً، مع تسوية الأتعاب المستحقة.</p>
<h3>٧) القانون المُطبَّق</h3>
<p>أنظمة المملكة العربية السعودية والمحاكم المختصة.</p>$body$,
 to_jsonb(ARRAY['client_name','lawyer_name','bar_license_no','date','services_summary','fee_amount','fee_basis','notice_days'])),

('عقد استشارات مالية سعودي (SOCPA)',
 'مستشار مالي/محاسبي مرخّص من الهيئة السعودية للمراجعين والمحاسبين.',
 'ksa','consulting_finance','consulting','ar',
 ARRAY['SOCPA','مراجعة'],
$body$<h2>عقد تقديم استشارات محاسبية ومالية</h2>
<p>بين <b>{{client_name}}</b> و<b>{{consultant_name}}</b>، عضوية SOCPA رقم {{socpa_no}}، بتاريخ {{date}}.</p>
<h3>١) نطاق الخدمات</h3>
<p>{{services_summary}}، وفق معايير المحاسبة الدولية المعتمدة في المملكة.</p>
<h3>٢) الأتعاب</h3>
<p>{{fee_amount}} ريال تُسدد {{fee_basis}}.</p>
<h3>٣) الاستقلالية والسرية</h3>
<p>التزام بمعايير الاستقلال المهني وسرية بيانات العميل.</p>
<h3>٤) المسؤولية المهنية</h3>
<p>سقف المسؤولية يعادل قيمة الأتعاب السنوية، باستثناء الغش والإهمال الجسيم.</p>
<h3>٥) المدة والإنهاء</h3>
<p>{{duration_months}} شهراً، إنهاء بإشعار {{notice_days}} يوماً.</p>$body$,
 to_jsonb(ARRAY['client_name','consultant_name','socpa_no','date','services_summary','fee_amount','fee_basis','duration_months','notice_days'])),

('عقد استشارات إدارية سعودي',
 'مستشار إداري للمشاريع وإعادة الهيكلة وفق أفضل الممارسات.',
 'ksa','consulting_admin','consulting','ar',
 ARRAY['إدارية','مشاريع'],
$body$<h2>عقد استشارات إدارية</h2>
<p>بين <b>{{client_name}}</b> و<b>{{consultant_name}}</b>، بتاريخ {{date}}.</p>
<h3>١) النطاق</h3>
<p>{{scope_summary}} وفق خطة عمل مرفقة بمخرجات قابلة للقياس.</p>
<h3>٢) الأتعاب والدفع</h3>
<p>{{fee_amount}} ريال تُسدد {{fee_basis}}، خلال {{payment_days}} يوماً من الفاتورة.</p>
<h3>٣) الملكية الفكرية</h3>
<p>تنتقل ملكية المخرجات للعميل عند سداد كامل الأتعاب.</p>
<h3>٤) السرية</h3>
<p>التزام السرية أثناء العقد ولمدة سنتين بعده.</p>
<h3>٥) الإنهاء</h3>
<p>بإشعار {{notice_days}} يوماً لأي طرف.</p>
<h3>٦) الاختصاص</h3>
<p>المحاكم المختصة في المملكة العربية السعودية.</p>$body$,
 to_jsonb(ARRAY['client_name','consultant_name','date','scope_summary','fee_amount','fee_basis','payment_days','duration_months','notice_days'])),

('ملحق تعديل راتب',
 'ملحق رسمي لتعديل الراتب الأساسي/البدلات يضاف على عقد العمل الأصلي.',
 'ksa','hr','salary_amendment','ar',
 ARRAY['ملحق','راتب','HR'],
$body$<h2>ملحق تعديل راتب</h2>
<p>إلحاقاً بعقد العمل المُبرم بتاريخ {{original_contract_date}} بين <b>{{company_name}}</b> و<b>{{employee_name}}</b> (الرقم الوظيفي {{employee_no}})، اتفق الطرفان على ما يلي:</p>
<h3>١) التعديل</h3>
<p>يُعدّل الراتب الأساسي ليصبح <b>{{new_base_salary}} ريال شهرياً</b> اعتباراً من {{effective_date}}، مع تعديل البدلات على النحو التالي: {{new_allowances}}.</p>
<h3>٢) باقي البنود</h3>
<p>تبقى سائر بنود العقد الأصلي سارية دون تغيير.</p>
<h3>٣) التوقيع</h3>
<p>وقّع الطرفان في {{date}}.</p>$body$,
 to_jsonb(ARRAY['original_contract_date','company_name','employee_name','employee_no','new_base_salary','effective_date','new_allowances','date'])),

('اتفاقية إنهاء خدمة بالتراضي',
 'إنهاء علاقة العمل بالتراضي مع إبراء ذمة متبادل وتسوية المستحقات.',
 'ksa','hr','termination','ar',
 ARRAY['إنهاء','إبراء ذمة'],
$body$<h2>اتفاقية إنهاء خدمة بالتراضي</h2>
<p>أُبرمت في {{date}} بين <b>{{company_name}}</b> و<b>{{employee_name}}</b> (الرقم الوظيفي {{employee_no}}).</p>
<h3>١) إنهاء العلاقة</h3>
<p>يتم إنهاء عقد العمل بالتراضي اعتباراً من {{end_date}}.</p>
<h3>٢) تسوية المستحقات</h3>
<p>يُسدّد لصاحب العمل/العامل المبلغ الإجمالي {{settlement_amount}} ريال شاملاً: المتبقي من الأجر، رصيد الإجازات، مكافأة نهاية الخدمة وفق نظام العمل.</p>
<h3>٣) إبراء ذمة متبادل</h3>
<p>يُقرّ الطرفان بأن لا مطالبات متبادلة بعد سداد المستحقات أعلاه، مع التزام العامل بسرية المعلومات وإعادة كل عُهدة بحوزته.</p>
<h3>٤) القانون المُطبَّق</h3>
<p>أنظمة المملكة العربية السعودية والمحاكم العمالية المختصة.</p>$body$,
 to_jsonb(ARRAY['date','company_name','employee_name','employee_no','end_date','settlement_amount'])),

('اتفاقية تدريب وتطوير داخلي (HR)',
 'تتيح إلزام الموظف بحد أدنى من الخدمة بعد ابتعاثه أو تدريبه على نفقة الشركة.',
 'ksa','hr','employment','ar',
 ARRAY['تدريب','ابتعاث','استرداد تكاليف'],
$body$<h2>اتفاقية تدريب وتطوير</h2>
<p>بين <b>{{company_name}}</b> و<b>{{employee_name}}</b> (الرقم الوظيفي {{employee_no}})، بتاريخ {{date}}.</p>
<h3>١) البرنامج التدريبي</h3>
<p>تتكفّل الشركة بتسجيل العامل في برنامج <b>{{program_name}}</b> لدى {{provider}}، بتكلفة إجمالية {{program_cost}} ريال خلال الفترة {{program_period}}.</p>
<h3>٢) الالتزام بالبقاء</h3>
<p>يلتزم العامل بالاستمرار في خدمة الشركة لمدة لا تقل عن <b>{{commitment_months}}</b> شهراً بعد انتهاء البرنامج.</p>
<h3>٣) استرداد التكاليف</h3>
<p>في حال استقالة العامل قبل انتهاء فترة الالتزام لسبب يعود إليه، يلتزم بسداد جزء من تكاليف البرنامج بالتناسب مع المدة المتبقية.</p>
<h3>٤) السرية</h3>
<p>كل المواد والمعارف المكتسبة تظل ضمن نطاق الاستخدام الوظيفي للشركة.</p>$body$,
 to_jsonb(ARRAY['company_name','employee_name','employee_no','date','program_name','provider','program_cost','program_period','commitment_months']));
