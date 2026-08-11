INSERT INTO public.contract_templates (name, description, body, variables, is_active, jurisdiction, department, contract_type, language, tags)
SELECT t.name, t.description, t.body, to_jsonb(t.variables), t.is_active, t.jurisdiction::text, t.department::text, t.contract_type::text, t.language::text, t.tags
FROM (VALUES
('عقد عمل — مطوّر برمجيات',
 'عقد عمل احترافي لمطوّر برمجيات وفق نظام العمل السعودي',
 E'<h2 style="text-align:center">عقد عمل — مطوّر برمجيات</h2>\n<p>أُبرم هذا العقد في {{contract_date}} بين:</p>\n<p><strong>الطرف الأول:</strong> {{company_name}} ({{company_cr}})</p>\n<p><strong>الطرف الثاني:</strong> {{employee_name}} — هوية رقم {{employee_id}}</p>\n<h3>1. المسمى الوظيفي</h3><p>يعمل الطرف الثاني بوظيفة <strong>{{job_title}}</strong> ضمن قسم {{department}}.</p>\n<h3>2. مدة العقد</h3><p>يبدأ من {{start_date}} ولمدة {{duration_months}} شهرًا قابلة للتجديد.</p>\n<h3>3. الراتب</h3><p>راتب شهري إجمالي قدره <strong>{{salary}}</strong> ريال سعودي، يُصرف نهاية كل شهر ميلادي.</p>\n<h3>4. ساعات العمل</h3><p>{{working_hours}} ساعة أسبوعياً بنظام {{work_mode}}.</p>\n<h3>5. الإجازات</h3><p>إجازة سنوية مدفوعة 21 يوماً وفق المادة 109 من نظام العمل.</p>\n<h3>6. الملكية الفكرية</h3><p>جميع الأكواد والوثائق ملكية حصرية للطرف الأول.</p>\n<h3>7. السرية</h3><p>سرية تامة طوال مدة العقد ولمدة سنتين بعده.</p>\n<p>وقّع بتاريخ: {{contract_date}}</p>',
 ARRAY['contract_date','company_name','company_cr','employee_name','employee_id','job_title','department','start_date','duration_months','salary','working_hours','work_mode'],
 true,'ksa','tech','employment','ar', ARRAY['تقنية','مطور']),

('عقد عمل — مهندس DevOps/Cloud','عقد لمهندس بنية تحتية سحابية',
 E'<h2 style="text-align:center">عقد عمل — مهندس DevOps</h2>\n<p>بين {{company_name}} و {{employee_name}} بتاريخ {{contract_date}}.</p>\n<h3>المسمى</h3><p>{{job_title}} — إدارة البنية السحابية وCI/CD.</p>\n<h3>الراتب</h3><p>{{salary}} ريال + بدل اتصالات {{allowance}} ريال.</p>\n<h3>المناوبة</h3><p>تعويض {{oncall_rate}} ريال للساعة عن الطوارئ.</p>',
 ARRAY['contract_date','company_name','employee_name','job_title','salary','allowance','oncall_rate'],
 true,'ksa','tech','employment','ar', ARRAY['DevOps','Cloud']),

('NDA — اتفاقية سرية تقنية','اتفاقية سرية أحادية للأكواد والبنية التقنية',
 E'<h2 style="text-align:center">اتفاقية عدم إفصاح — تقنية</h2>\n<p>بين {{company_name}} و {{recipient_name}} بتاريخ {{contract_date}}.</p>\n<h3>المعلومات السرية</h3><p>الكود المصدري، المعمارية، قواعد البيانات، مفاتيح API.</p>\n<h3>المدة</h3><p>{{duration_years}} سنوات.</p>\n<h3>العقوبة</h3><p>لا تقل عن {{penalty}} ريال + الأضرار الفعلية.</p>',
 ARRAY['contract_date','company_name','recipient_name','duration_years','penalty'],
 true,'ksa','tech','nda_unilateral','ar', ARRAY['NDA']),

('عقد استشاري تقني — Freelance','عقد لمستشار تقني بالساعة',
 E'<h2 style="text-align:center">عقد خدمات استشارية تقنية</h2>\n<p>بين {{company_name}} و {{consultant_name}} بتاريخ {{contract_date}}.</p>\n<h3>النطاق</h3><p>{{scope}}</p>\n<h3>الأتعاب</h3><p>{{hourly_rate}} ريال/ساعة، سقف شهري {{monthly_cap}} ساعة.</p>\n<h3>المدة</h3><p>من {{start_date}} إلى {{end_date}}.</p>',
 ARRAY['contract_date','company_name','consultant_name','scope','hourly_rate','monthly_cap','start_date','end_date'],
 true,'ksa','tech','consulting','ar', ARRAY['Freelance']),

('عقد عمل — أخصائي تسويق رقمي','عقد لأخصائي تسويق رقمي',
 E'<h2 style="text-align:center">عقد عمل — أخصائي تسويق رقمي</h2>\n<p>بين {{company_name}} و {{employee_name}} بتاريخ {{contract_date}}.</p>\n<h3>المهام</h3><p>إدارة حملات Google/Meta/TikTok وتقارير ROI/CAC.</p>\n<h3>الراتب</h3><p>{{salary}} ريال + عمولة {{commission_pct}}% عند تجاوز ROAS {{target_roas}}.</p>\n<h3>الميزانية</h3><p>سقف الصرف بدون موافقة: {{ad_budget_cap}} ريال شهرياً.</p>',
 ARRAY['contract_date','company_name','employee_name','salary','commission_pct','target_roas','ad_budget_cap'],
 true,'ksa','marketing','employment','ar', ARRAY['تسويق','Digital']),

('عقد عمل — منشئ محتوى','عقد لصانع محتوى',
 E'<h2 style="text-align:center">عقد عمل — منشئ محتوى</h2>\n<p>بين {{company_name}} و {{employee_name}} بتاريخ {{contract_date}}.</p>\n<h3>المخرجات</h3><p>{{monthly_videos}} فيديو + {{monthly_posts}} منشور + {{monthly_designs}} تصميم شهرياً.</p>\n<h3>الراتب</h3><p>{{salary}} ريال شهرياً.</p>\n<h3>الملكية</h3><p>كل المحتوى بما فيه Raw Files ملك للشركة.</p>',
 ARRAY['contract_date','company_name','employee_name','monthly_videos','monthly_posts','monthly_designs','salary'],
 true,'ksa','marketing','employment','ar', ARRAY['محتوى']),

('اتفاقية أداء — KPIs تسويقية','مؤشرات أداء قابلة للقياس',
 E'<h2 style="text-align:center">اتفاقية مؤشرات الأداء</h2>\n<p>مكمّلة لعقد {{employee_name}} بتاريخ {{contract_date}}.</p>\n<h3>المؤشرات الربعية</h3><ul><li>عملاء جدد: {{kpi_new_customers}}</li><li>CAC: ≤ {{kpi_cac}} ريال</li><li>التحويل: ≥ {{kpi_conversion}}%</li></ul>\n<h3>المكافأة</h3><p>عند 100%+: {{bonus}} ريال.</p>',
 ARRAY['contract_date','employee_name','kpi_new_customers','kpi_cac','kpi_conversion','bonus'],
 true,'ksa','marketing','employment','ar', ARRAY['KPI']),

('عقد خدمات وكالة تسويقية','عقد لمزوّد خدمات تسويق خارجي',
 E'<h2 style="text-align:center">عقد خدمات وكالة تسويقية</h2>\n<p>بين {{company_name}} و {{agency_name}} بتاريخ {{contract_date}}.</p>\n<h3>الخدمات</h3><p>{{services}}</p>\n<h3>الأتعاب</h3><p>{{monthly_fee}} ريال + {{ad_spend_management_pct}}% من ميزانية الإعلانات.</p>\n<h3>المدة</h3><p>{{duration_months}} شهرًا من {{start_date}}.</p>',
 ARRAY['contract_date','company_name','agency_name','services','monthly_fee','ad_spend_management_pct','duration_months','start_date'],
 true,'ksa','marketing','consulting','ar', ARRAY['Agency']),

('عقد استشاري إداري','عقد لاستشاري إداري وتطوير مؤسسي',
 E'<h2 style="text-align:center">عقد استشارات إدارية</h2>\n<p>بين {{company_name}} و {{consultant_name}} بتاريخ {{contract_date}}.</p>\n<h3>النطاق</h3><p>{{scope}}</p>\n<h3>التسليمات</h3><p>{{deliverables}}</p>\n<h3>الأتعاب</h3><p>{{total_fee}} ريال على {{milestones_count}} دفعات.</p>\n<h3>المدة</h3><p>{{duration_weeks}} أسبوعًا.</p>',
 ARRAY['contract_date','company_name','consultant_name','scope','deliverables','total_fee','milestones_count','duration_weeks'],
 true,'ksa','consulting_admin','consulting','ar', ARRAY['استشارات']),

('عقد استشاري مالي','عقد لاستشاري مالي ومحاسبي',
 E'<h2 style="text-align:center">عقد استشارات مالية</h2>\n<p>بين {{company_name}} و {{consultant_name}} بتاريخ {{contract_date}}.</p>\n<h3>الخدمات</h3><p>القوائم المالية، التخطيط الضريبي ZATCA، دراسات الجدوى.</p>\n<h3>الأتعاب</h3><p>{{monthly_fee}} ريال شهرياً لـ {{duration_months}} شهراً.</p>\n<h3>السرية</h3><p>5 سنوات.</p>',
 ARRAY['contract_date','company_name','consultant_name','monthly_fee','duration_months'],
 true,'ksa','consulting_finance','consulting','ar', ARRAY['مالي']),

('عقد استشاري قانوني','عقد لمستشار قانوني',
 E'<h2 style="text-align:center">عقد استشارات قانونية</h2>\n<p>بين {{company_name}} والمكتب القانوني {{law_firm}} ممثلاً بـ {{consultant_name}} بتاريخ {{contract_date}}.</p>\n<h3>الخدمات</h3><p>مراجعة العقود، التمثيل الحكومي، التقاضي.</p>\n<h3>الأتعاب</h3><p>Retainer شهري {{retainer}} ريال + {{hourly_rate}} ريال/ساعة إضافية.</p>',
 ARRAY['contract_date','company_name','law_firm','consultant_name','retainer','hourly_rate'],
 true,'ksa','consulting_legal','consulting','ar', ARRAY['Legal']),

('بيان نطاق العمل — SOW','SOW لمشروع استشاري',
 E'<h2 style="text-align:center">بيان نطاق العمل — SOW</h2>\n<p>المشروع: {{project_name}} — تاريخ: {{contract_date}}</p>\n<h3>الأهداف</h3><p>{{objectives}}</p>\n<h3>التسليمات</h3><p>{{deliverables}}</p>\n<h3>الجدول</h3><p>من {{start_date}} إلى {{end_date}}.</p>\n<h3>الميزانية</h3><p>{{budget}} ريال شامل الضريبة.</p>\n<h3>القبول</h3><p>{{acceptance_criteria}}</p>',
 ARRAY['project_name','contract_date','objectives','deliverables','start_date','end_date','budget','acceptance_criteria'],
 true,'ksa','consulting_admin','consulting','ar', ARRAY['SOW']),

('NDA — اتفاقية سرية أحادية','اتفاقية سرية عامة',
 E'<h2 style="text-align:center">اتفاقية عدم إفصاح أحادية</h2>\n<p>بين {{disclosing_party}} و {{receiving_party}} بتاريخ {{contract_date}}.</p>\n<h3>التعريف</h3><p>كل معلومة مكتوبة أو شفهية ذات قيمة تجارية.</p>\n<h3>المدة</h3><p>{{duration_years}} سنوات.</p>\n<h3>الاختصاص</h3><p>محاكم {{jurisdiction_city}} — أنظمة المملكة.</p>',
 ARRAY['disclosing_party','receiving_party','contract_date','duration_years','jurisdiction_city'],
 true,'ksa','general','nda_unilateral','ar', ARRAY['NDA']),

('NDA — اتفاقية سرية متبادلة','اتفاقية سرية بين شركتين',
 E'<h2 style="text-align:center">اتفاقية عدم إفصاح متبادلة</h2>\n<p>بين {{party_a}} و {{party_b}} بتاريخ {{contract_date}}.</p>\n<p>التزام متبادل بحماية المعلومات لمدة {{duration_years}} سنوات.</p>\n<h3>الغرض</h3><p>{{purpose}}</p>',
 ARRAY['party_a','party_b','contract_date','duration_years','purpose'],
 true,'ksa','general','nda_mutual','ar', ARRAY['Mutual']),

('NDA — سرية ما بعد الخدمة','تُوقَّع عند مغادرة الموظف',
 E'<h2 style="text-align:center">اتفاقية سرية ما بعد الخدمة</h2>\n<p>أنا {{employee_name}}، الموظف السابق في {{company_name}}، ألتزم بـ:</p>\n<ul><li>عدم إفشاء أي معلومات سرية.</li><li>عدم استقطاب العملاء لـ {{non_solicit_months}} شهراً.</li><li>عدم استقطاب الموظفين لـ {{non_solicit_months}} شهراً.</li><li>إعادة جميع الأجهزة والوثائق.</li></ul>\n<p>التاريخ: {{contract_date}}</p>',
 ARRAY['employee_name','company_name','non_solicit_months','contract_date'],
 true,'ksa','hr','nda_unilateral','ar', ARRAY['Exit']),

('عقد عمل عام — نظام العمل السعودي','عقد توظيف قياسي وفق المادة 51',
 E'<h2 style="text-align:center">عقد عمل</h2>\n<p>أُبرم في {{contract_date}} بين {{company_name}} (س.ت {{company_cr}}) و {{employee_name}} (هوية {{employee_id}}، الجنسية {{nationality}}).</p>\n<h3>الوظيفة</h3><p>{{job_title}} — {{department}}.</p>\n<h3>المدة</h3><p>{{contract_type_text}} يبدأ من {{start_date}}.</p>\n<h3>التجربة</h3><p>{{probation_days}} يوماً.</p>\n<h3>الراتب</h3><ul><li>أساسي: {{basic_salary}} ريال</li><li>سكن: {{housing}} ريال</li><li>مواصلات: {{transport}} ريال</li><li>الإجمالي: <strong>{{total_salary}}</strong> ريال</li></ul>\n<h3>الدوام</h3><p>{{working_hours}} ساعة أسبوعياً، {{work_days}}.</p>',
 ARRAY['contract_date','company_name','company_cr','employee_name','employee_id','nationality','job_title','department','contract_type_text','start_date','probation_days','basic_salary','housing','transport','total_salary','working_hours','work_days'],
 true,'ksa','hr','employment','ar', ARRAY['Standard']),

('ملحق تعديل راتب','ملحق رسمي لتعديل الراتب',
 E'<h2 style="text-align:center">ملحق تعديل راتب</h2>\n<p>إشارة لعقد {{employee_name}} بتاريخ {{original_contract_date}}.</p>\n<p>تعديل الراتب من {{effective_date}}:</p>\n<ul><li>السابق: {{old_salary}} ريال</li><li>الجديد: <strong>{{new_salary}}</strong> ريال</li><li>السبب: {{reason}}</li></ul>\n<p>باقي البنود سارية.</p>',
 ARRAY['employee_name','original_contract_date','effective_date','old_salary','new_salary','reason','contract_date'],
 true,'ksa','hr','salary_amendment','ar', ARRAY['راتب']),

('إخلاء طرف — إنهاء خدمة','وثيقة إنهاء خدمة',
 E'<h2 style="text-align:center">إخلاء طرف وإنهاء خدمة</h2>\n<p>تُقر {{company_name}} بانتهاء خدمة {{employee_name}} بتاريخ {{end_date}}.</p>\n<h3>السبب</h3><p>{{termination_reason}}</p>\n<h3>المستحقات</h3><ul><li>آخر شهر: {{last_salary}} ريال</li><li>EOSB: {{eosb}} ريال</li><li>رصيد إجازات: {{leave_balance_amount}} ريال</li><li>الإجمالي: <strong>{{total_settlement}}</strong> ريال</li></ul>\n<p>أُقر بإخلاء طرف الشركة من أي حق.</p>',
 ARRAY['company_name','employee_name','end_date','termination_reason','last_salary','eosb','leave_balance_amount','total_settlement','contract_date'],
 true,'ksa','hr','termination','ar', ARRAY['EOSB']),

('شهادة خبرة','شهادة خبرة رسمية',
 E'<h2 style="text-align:center">شهادة خبرة</h2>\n<p>تشهد {{company_name}} بأن السيد/ة <strong>{{employee_name}}</strong> عمل/ت لدينا بوظيفة <strong>{{job_title}}</strong> في {{department}} من {{start_date}} إلى {{end_date}}.</p>\n<p>وقد أبدى/ت كفاءة عالية والتزاماً مهنياً.</p>\n<p>التاريخ: {{contract_date}}</p>',
 ARRAY['company_name','employee_name','job_title','department','start_date','end_date','contract_date'],
 true,'ksa','hr','employment','ar', ARRAY['خبرة'])
) AS t(name, description, body, variables, is_active, jurisdiction, department, contract_type, language, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.contract_templates ct WHERE ct.name = t.name);