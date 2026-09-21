// No student, school, class or credential is included in a purchased block key.
export function examBlockKey(value) {
  if (!value || !/^20\d{2}$/.test(String(value.year)) || !/^[1-4]$/.test(String(value.term))) throw new Error('Ano e bimestre inválidos.');
  const assessment=String(value.assessment||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\bBLOCO\b/g,'').replace(/[^A-Z0-9]/g,'');
  // Unknown assessment names must not silently consume a credit.
  if (!/^CICLO\d+(LGG|MAT|CNT|CHSA|CHS|CH)$/.test(assessment)) throw new Error('Avaliação não reconhecida para crédito avulso.');
  return `${value.year}:${value.term}:${assessment.replace(/CHSA?$|CHS$/,'CH')}`;
}
