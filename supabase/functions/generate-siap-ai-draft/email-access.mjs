// Owner-authorized email-only access. This proves entitlement, not identity.
// Never return a Supabase Auth session or use this policy for Carometro data access.
export function normalizeAccessEmail(value) {
  if (typeof value !== 'string') return null;
  const email=value.trim().toLowerCase();
  return email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export function emailAccessLicense(general, exam, email, now=Date.now()) {
  const bundle=!!exam?.generalUntil && Date.parse(exam.generalUntil)>now;
  const generalAllowed=general?.active===true && ['carometro','subscription'].includes(general.mode);
  const examAllowed=exam?.active===true;
  if (!generalAllowed && !bundle && !examAllowed) return null;
  return {...general,active:generalAllowed||bundle,mode:bundle?'subscription':general?.mode,
    ...(bundle?{status:'subscribed',accessEndsAt:exam.generalUntil}:{}),
    freeUses:null,accountEmail:email,examAccess:exam};
}
