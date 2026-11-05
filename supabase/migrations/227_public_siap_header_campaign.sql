-- Entrega somente os dados publicos da campanha ativa para a extensao.
begin;

create or replace function public.get_siap_public_header_campaign()
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_campaign public.siap_assistant_header_campaign%rowtype;
  v_buttons jsonb;
begin
  select * into v_campaign from public.siap_assistant_header_campaign where id = true;
  if not found or v_campaign.active is not true then
    return jsonb_build_object('active', false);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'plan_key', b.value->>'plan_key',
    'label', b.value->>'label',
    'color', b.value->>'color',
    'text_color', b.value->>'text_color',
    'amount', p.amount
  ) order by b.ordinality), '[]'::jsonb) into v_buttons
  from jsonb_array_elements(v_campaign.buttons) with ordinality as b(value, ordinality)
  join public.siap_assistant_plans p on p.plan_key = b.value->>'plan_key'
    and p.active = true and p.amount > 0;
  return jsonb_build_object(
    'active', true,
    'eyebrow', v_campaign.eyebrow,
    'headline', v_campaign.headline,
    'background_color', v_campaign.background_color,
    'text_color', v_campaign.text_color,
    'background_image_url', v_campaign.background_image_url,
    'buttons', v_buttons
  );
end;
$function$;

revoke all on function public.get_siap_public_header_campaign() from public;
grant execute on function public.get_siap_public_header_campaign() to anon, authenticated;

commit;
