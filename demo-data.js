/* بيانات تجريبية فقط لتجربة اللوحة. أسماء وأرقام وهمية. */
(function (root) {
  var rows = [
    {
      id: 'demo0001', submittedAt: '2026-11-15T09:12:00Z', name: 'متقدم تجريبي ١', phone: '+201000000001', country: 'مصر',
      years: 'أكثر من ٥ سنوات', platforms: 'Meta Ads، Google Ads، TikTok Ads', spend: '١٢٬٠٠٠ دولار شهريًا',
      niche: 'أدرت حملات لثلاثة معارض أثاث وديكور في الرياض وجدة، ومتجر مفروشات على سلة. ركزنا على الكتالوج والـ Leads لمواعيد المعرض.',
      gulf: 'اشتغلت على السعودية والإمارات لأكثر من أربع سنوات. أعرف سلوك الدفع عند الاستلام وتمارا وتابي، وموسم رمضان واليوم الوطني والجمعة البيضاء.',
      result: 'متجر أثاث في الرياض: ميزانية 8000 دولار شهريًا، ROAS من 2.1 إلى 4.3 خلال 3 أشهر، وتكلفة الطلب نزلت من 38 إلى 21 ريال، والمبيعات زادت 85%.',
      tracking: 'أتأكد من Pixel وConversions API مع إزالة التكرار بالـ event id، وأفحص Events Manager وTest Events، وأضبط UTM وGA4 عبر GTM قبل أول إنفاق.',
      drop: 'أفحص تكرار الإعلان وإجهاد الإبداع، ثم تداخل الجمهور والميزانية ومرحلة التعلم، ثم سرعة الصفحة وسلة الدفع والمخزون والمنافسين.',
      cv: 'https://drive.google.com/file/d/demo-cv-1/view', work: 'https://drive.google.com/drive/folders/demo-results-1',
      avail: 'فورًا', rate: '1200 دولار شهريًا', more: ''
    },
    {
      id: 'demo0002', submittedAt: '2026-11-15T14:40:00Z', name: 'متقدم تجريبي ٢', phone: '+966500000002', country: 'السعودية',
      years: 'من ٣ إلى ٥ سنوات', platforms: 'Meta Ads، Snapchat Ads', spend: '30 ألف ريال',
      niche: 'اشتغلت مع متاجر إلكترونية في الأزياء والعطور، ولم أعمل مع الأثاث لكن مستعد أتعلم.',
      gulf: 'مقيم في الرياض وأعرف السوق السعودي ومواسمه مثل رمضان والعيد.',
      result: 'متجر عطور: ميزانية 20 ألف ريال، 1200 طلب، ROAS 3.2.',
      tracking: 'أستخدم Pixel وأتابع الأحداث من Events Manager.',
      drop: 'أراجع الإعلانات والجمهور وأغيّر الإبداع.',
      cv: 'https://example.com/cv.pdf', work: 'https://notion.so/demo-results-2',
      avail: 'خلال أسبوعين', rate: '4000 ريال شهريًا', more: ''
    },
    {
      id: 'demo0003', submittedAt: '2026-11-16T08:05:00Z', name: 'متقدم تجريبي ٣', phone: '+201000000003', country: 'مصر',
      years: 'من ١ إلى ٣ سنوات', platforms: 'Meta Ads', spend: '800 دولار',
      niche: 'اشتغلت على عيادات وكورسات وشوية متاجر.',
      gulf: 'اشتغلت على السوق المصري أغلب الوقت.',
      result: 'جبت نتائج كويسة لكذا عميل وزودت المبيعات.',
      tracking: 'بركّب البيكسل وبتأكد إنه شغال.',
      drop: 'أغيّر الإعلان.',
      cv: 'https://drive.google.com/file/d/demo-cv-3/view', work: '',
      avail: 'فورًا', rate: '', more: ''
    },
    {
      id: 'demo0004', submittedAt: '2026-11-16T10:30:00Z', name: 'متقدم تجريبي ٤', phone: '12', country: 'الأردن',
      years: 'أقل من سنة', platforms: 'TikTok Ads', spend: '',
      niche: 'مبتدئ',
      gulf: 'لا',
      result: '',
      tracking: '',
      drop: '',
      cv: 'cv-link-here', work: 'https://drive.google.com/file/d/demo-cv-3/view',
      avail: 'خلال شهر', rate: '', more: ''
    },
    {
      id: 'demo0005', submittedAt: '2026-11-16T12:15:00Z', name: 'متقدم تجريبي ٥', phone: '+971500000005', country: 'الإمارات',
      years: 'أكثر من ٥ سنوات', platforms: 'Meta Ads، Google Ads', spend: '600 دولار',
      niche: 'خبرة واسعة في الديكور والأثاث على متاجر شوبيفاي ومعارض في دبي والرياض.',
      gulf: 'خبرة في السوق الخليجي والسعودية والإمارات مع الدفع عند الاستلام وتابي وتمارا ومواسم رمضان.',
      result: 'رفعت المبيعات 120% وخفضت التكلفة 40% وحققت ROAS ممتاز مع عدة عملاء.',
      tracking: 'Pixel وCapi وGTM وUTM وGA4 وevents manager وإزالة التكرار.',
      drop: 'تكرار الإعلان والجمهور والصفحة والميزانية والتتبع والمنافسين.',
      cv: 'https://linkedin.com/in/demo', work: 'https://linkedin.com/in/demo',
      avail: 'فورًا', rate: '2000 دولار', more: ''
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = rows;
  else root.MAGMAFY_DEMO_ROWS = rows;
})(typeof window !== 'undefined' ? window : this);
