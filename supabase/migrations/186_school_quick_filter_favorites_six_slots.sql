begin;

alter table public.school_quick_filter_favorites
  add column if not exists favorite_4 text,
  add column if not exists favorite_5 text,
  add column if not exists favorite_6 text;

alter table public.school_quick_filter_favorites
  add constraint school_quick_filter_favorites_extra_valid check (
    (favorite_4 is null or (
      btrim(favorite_4) <> ''
      and favorite_4 <> all(array[favorite_1,favorite_2,favorite_3])
    ))
    and (favorite_5 is null or (
      btrim(favorite_5) <> ''
      and favorite_5 <> all(array[favorite_1,favorite_2,favorite_3])
      and (favorite_4 is null or favorite_5 <> favorite_4)
    ))
    and (favorite_6 is null or (
      btrim(favorite_6) <> ''
      and favorite_6 <> all(array[favorite_1,favorite_2,favorite_3])
      and (favorite_4 is null or favorite_6 <> favorite_4)
      and (favorite_5 is null or favorite_6 <> favorite_5)
    ))
  );

comment on table public.school_quick_filter_favorites is
  'Até seis atalhos de filtro escolhidos pela administração ou coordenação, isolados por escola.';

commit;
