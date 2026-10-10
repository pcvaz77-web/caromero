alter table public.cepi_exam_headers
  add column instructions text not null default 'Leia atentamente cada questão, assinale a única alternativa correta e, em seguida, transcreva suas respostas para o cartão-resposta. Boa prova!';

alter table public.cepi_exam_headers
  add constraint cepi_exam_headers_instructions_length
  check (char_length(instructions) <= 500);
