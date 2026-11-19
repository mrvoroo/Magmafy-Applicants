// Public configuration. The URL is not a secret: all access control happens on the server.
window.MAGMAFY_CONFIG = {
  endpoint: 'https://script.google.com/macros/s/AKfycbxc4np4V7RqtRUjoGG57SXt-ey-WyUH1JyuTFPe8CRgoIeTrpATdq-3vtv_1boBvuaXoA/exec',
  idleLogoutMinutes: 30,
  // Used to fill the contract. The person starting a contract picks who signs for Magmafy from `reps`.
  company: { entity: 'ماجمافاي', reps: [{ name: 'م. أحمد أشرف', title: 'شريك مؤسس' }, { name: 'م. عبدالله محمود', title: 'شريك مؤسس' }] }

};
