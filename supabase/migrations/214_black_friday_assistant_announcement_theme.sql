begin;

-- O comunicado atual usava uma captura da página de vendas como imagem interna.
-- A arte agora é feita pelo tema; texto e link do botão permanecem iguais.
update public.siap_assistant_announcement
set theme_key = 'black_friday',
    theme_color = '#080e1b',
    theme_text_color = '#fff5d4',
    theme_image_url = null,
    media_type = null,
    media_url = null,
    updated_at = now()
where id = true
  and active = true
  and title = 'PROMOÇÃO VALIDA ATÉ DEZEMBRO'
  and media_type = 'image';

commit;
